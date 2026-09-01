import hashlib
import json
import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Literal

from ortools.sat.python import cp_model

from app.models import (
    Alternative,
    Assignment,
    MovedAssignment,
    Position,
    Requirement,
    SolveRequest,
    SolveResponse,
)
from app.scoring import SOFT_CONSTRAINT_CODES, score_assignments
from app.validator import validate_assignments

MAX_STRUCTURAL_DIAGNOSTICS = 5
MAX_DIAGNOSTIC_REQUIREMENTS = 12
MAX_DIAGNOSTIC_OVERLAPS = 8


@dataclass(frozen=True)
class Choice:
    requirement_id: str
    occurrence: int
    day: int
    period: int
    room_id: str | None
    duration: int


def part_time_distribution_can_relax(request: SolveRequest, requirement: Requirement) -> bool:
    if request.schema_version != 2:
        return False
    teacher = next(item for item in request.teachers if item.id == requirement.teacher_id)
    return teacher.employment_type == "PART_TIME"


def class_break_after_session(request: SolveRequest, class_section_id: str) -> int | None:
    class_section = next(item for item in request.class_sections if item.id == class_section_id)
    if class_section.recess_after_session is not None:
        return class_section.recess_after_session
    return request.week_configuration.break_after_session if request.week_configuration else None


def crosses_break(
    left_period: int,
    right_period: int,
    break_after_session: int | None,
    teaching_session_by_period: dict[int, int],
) -> bool:
    left_session = teaching_session_by_period.get(left_period)
    right_session = teaching_session_by_period.get(right_period)
    return (
        break_after_session is not None
        and left_session == break_after_session
        and right_session == break_after_session + 1
    )


def class_session_interval(
    request: SolveRequest,
    class_section_id: str,
    period: int,
    duration: int,
) -> tuple[int, int]:
    if request.schema_version != 2 or request.week_configuration is None:
        return (period, period + duration)
    break_after_session = class_break_after_session(request, class_section_id)
    shift = (
        request.week_configuration.break_duration_minutes
        if break_after_session is not None and period >= break_after_session
        else 0
    )
    starts_at = (
        request.week_configuration.first_session_start_minutes
        + period * request.week_configuration.session_duration_minutes
        + shift
    )
    return (
        starts_at,
        starts_at + duration * request.week_configuration.session_duration_minutes,
    )


def intervals_overlap(left: tuple[int, int], right: tuple[int, int]) -> bool:
    return left[0] < right[1] and right[0] < left[1]


def input_fingerprint(request: SolveRequest) -> str:
    data = request.model_dump(
        by_alias=True,
        exclude={"job_id"},
        exclude_unset=True,
    )
    canonical = json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


def compatible_choices(
    request: SolveRequest, requirement: Requirement, occurrence: int
) -> list[Choice]:
    enabled = {(slot.day_index, slot.period_index) for slot in request.calendar.enabled_slots}
    teaching = {period.index for period in request.calendar.periods if period.is_teaching}
    forbidden = {(slot.day_index, slot.period_index) for slot in requirement.forbidden_slots}
    unavailable = {
        (rule.entity_type, rule.entity_id, rule.day_index, rule.period_index)
        for rule in request.availability
        if rule.state == "UNAVAILABLE"
    }
    if request.options.rooms_enabled:
        rooms: list[str | None] = [
            room.id
            for room in request.rooms
            if (not requirement.required_room_id or room.id == requirement.required_room_id)
            and (not requirement.required_room_type or room.type == requirement.required_room_type)
        ]
        if not requirement.required_room_id and not requirement.required_room_type:
            rooms = [None]
    else:
        rooms = [None]

    fixed: Position | Assignment | None = (
        requirement.fixed_slots[occurrence] if occurrence < len(requirement.fixed_slots) else None
    )
    locked = [item for item in request.locked_assignments if item.requirement_id == requirement.id]
    if occurrence < len(locked):
        fixed = locked[occurrence]
    break_after_session = (
        class_break_after_session(request, requirement.class_section_id)
        if request.schema_version == 2
        else None
    )

    choices: list[Choice] = []
    for day, period in sorted(enabled):
        if fixed and (day != fixed.day_index or period != fixed.period_index):
            continue
        if (day, period) in forbidden:
            continue
        for room_id in rooms:
            if isinstance(fixed, Assignment) and room_id != fixed.room_id:
                continue
            if (
                break_after_session is not None
                and period < break_after_session <= period + requirement.occurrence_duration - 1
            ):
                continue
            valid = True
            for offset in range(requirement.occurrence_duration):
                position = (day, period + offset)
                if position not in enabled or position[1] not in teaching:
                    valid = False
                    break
                resources = (
                    ("TEACHER", requirement.teacher_id),
                    ("CLASS_SECTION", requirement.class_section_id),
                    ("ROOM", room_id),
                )
                if any(
                    entity_id is not None
                    and (kind, entity_id, position[0], position[1]) in unavailable
                    for kind, entity_id in resources
                ):
                    valid = False
                    break
            if valid:
                choices.append(
                    Choice(
                        requirement.id,
                        occurrence,
                        day,
                        period,
                        room_id,
                        requirement.occurrence_duration,
                    )
                )
    return choices


def solve(request: SolveRequest) -> SolveResponse:
    started = time.monotonic()
    model = cp_model.CpModel()
    variables: dict[Choice, cp_model.IntVar] = {}
    constraints = 0
    requirement_by_id = {item.id: item for item in request.requirements}
    shared_requirements: dict[str, list[str]] = defaultdict(list)
    for requirement in request.requirements:
        if requirement.shared_teaching_group_id:
            shared_requirements[requirement.shared_teaching_group_id].append(requirement.id)
    shared_representatives = {
        requirement_ids[0] for requirement_ids in shared_requirements.values() if requirement_ids
    }
    positions_by_requirement: dict[str, dict[tuple[int, int, str | None], cp_model.IntVar]] = (
        defaultdict(dict)
    )

    for requirement in request.requirements:
        occurrence_range = (
            range(requirement.occurrence_count) if request.schema_version == 1 else range(1)
        )
        requirement_variables: list[cp_model.IntVar] = []
        choices_by_position: dict[tuple[int, int, str | None], cp_model.IntVar] = {}
        for occurrence in occurrence_range:
            choices = compatible_choices(request, requirement, occurrence)
            occurrence_variables = []
            for choice in choices:
                variable = model.new_bool_var(
                    f"x_{requirement.id}_{occurrence}_{choice.day}_{choice.period}_{choice.room_id}"
                )
                variables[choice] = variable
                positions_by_requirement[requirement.id][
                    (choice.day, choice.period, choice.room_id)
                ] = variable
                occurrence_variables.append(variable)
                requirement_variables.append(variable)
                choices_by_position[(choice.day, choice.period, choice.room_id)] = variable
            if not occurrence_variables:
                return _infeasible(request, started, len(variables), constraints)
            if request.schema_version == 1:
                model.add_exactly_one(occurrence_variables)
                constraints += 1

        if request.schema_version == 2:
            model.add(sum(requirement_variables) == requirement.occurrence_count)
            constraints += 1
            fixed_positions: list[Position | Assignment] = list(requirement.fixed_slots)
            fixed_positions.extend(
                item for item in request.locked_assignments if item.requirement_id == requirement.id
            )
            for fixed in fixed_positions:
                if isinstance(fixed, Assignment):
                    fixed_variables = (
                        [choices_by_position[(fixed.day_index, fixed.period_index, fixed.room_id)]]
                        if (
                            fixed.day_index,
                            fixed.period_index,
                            fixed.room_id,
                        )
                        in choices_by_position
                        else []
                    )
                else:
                    fixed_variables = [
                        variable
                        for (day, period, _room_id), variable in choices_by_position.items()
                        if day == fixed.day_index and period == fixed.period_index
                    ]
                if not fixed_variables:
                    return _infeasible(request, started, len(variables), constraints)
                model.add(sum(fixed_variables) == 1)
                constraints += 1

    for _group_id, requirement_ids in shared_requirements.items():
        if len(requirement_ids) < 2:
            return _infeasible(request, started, len(variables), constraints)
        anchor = requirement_ids[0]
        anchor_requirement = requirement_by_id[anchor]
        anchor_positions = positions_by_requirement[anchor]
        for member_id in requirement_ids[1:]:
            member_requirement = requirement_by_id[member_id]
            member_positions = positions_by_requirement[member_id]
            all_positions = set(anchor_positions) | set(member_positions)
            for position in all_positions:
                left = anchor_positions.get(position, 0)
                right = member_positions.get(position, 0)
                model.add(left == right)
                constraints += 1
                if position in anchor_positions and position in member_positions:
                    anchor_interval = class_session_interval(
                        request,
                        anchor_requirement.class_section_id,
                        position[1],
                        anchor_requirement.occurrence_duration,
                    )
                    member_interval = class_session_interval(
                        request,
                        member_requirement.class_section_id,
                        position[1],
                        member_requirement.occurrence_duration,
                    )
                    if anchor_interval != member_interval:
                        model.add(left == 0)
                        constraints += 1

    occupancy: dict[tuple[str, str, int, int], list[cp_model.IntVar]] = defaultdict(list)
    teacher_choices: dict[
        tuple[str, int], list[tuple[Choice, Requirement, cp_model.IntVar, tuple[int, int]]]
    ] = defaultdict(list)
    starts_by_day: dict[tuple[str, int], list[cp_model.IntVar]] = defaultdict(list)
    starts_by_period: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)
    day_used: dict[tuple[str, int], cp_model.IntVar] = {}
    for choice, variable in variables.items():
        requirement = requirement_by_id[choice.requirement_id]
        starts_by_day[(choice.requirement_id, choice.day)].append(variable)
        starts_by_period[(choice.requirement_id, choice.day, choice.period)].append(variable)
        for offset in range(choice.duration):
            period = choice.period + offset
            if not requirement.shared_teaching_group_id or requirement.id in shared_representatives:
                occupancy[("teacher_load", requirement.teacher_id, choice.day, period)].append(
                    variable
                )
            occupancy[("class", requirement.class_section_id, choice.day, period)].append(variable)
            if choice.room_id:
                occupancy[("room", choice.room_id, choice.day, period)].append(variable)
    for (resource_type, _resource_id, _day, _period), conflict_variables in occupancy.items():
        if resource_type == "teacher_load":
            continue
        if len(conflict_variables) > 1:
            model.add(sum(conflict_variables) <= 1)
            constraints += 1
    for choice, variable in variables.items():
        requirement = requirement_by_id[choice.requirement_id]
        if requirement.shared_teaching_group_id and requirement.id not in shared_representatives:
            continue
        teacher_choices[(requirement.teacher_id, choice.day)].append(
            (
                choice,
                requirement,
                variable,
                class_session_interval(
                    request,
                    requirement.class_section_id,
                    choice.period,
                    choice.duration,
                ),
            )
        )
    for teacher_day_choices in teacher_choices.values():
        for index, left_event in enumerate(teacher_day_choices):
            for right_event in teacher_day_choices[index + 1 :]:
                left_choice, left_requirement, left_variable, left_interval = left_event
                right_choice, right_requirement, right_variable, right_interval = right_event
                same_shared_event = (
                    left_requirement.shared_teaching_group_id is not None
                    and left_requirement.shared_teaching_group_id
                    == right_requirement.shared_teaching_group_id
                    and left_choice.period == right_choice.period
                    and left_choice.room_id == right_choice.room_id
                    and left_interval == right_interval
                )
                if not same_shared_event and intervals_overlap(left_interval, right_interval):
                    model.add(left_variable + right_variable <= 1)
                    constraints += 1

    days = [day.index for day in request.calendar.days if day.is_working]
    teaching_periods = sorted(
        period.index for period in request.calendar.periods if period.is_teaching
    )
    teaching_session_by_period = {
        period: session for session, period in enumerate(teaching_periods, start=1)
    }
    raw_terms: dict[str, list[cp_model.LinearExpr]] = defaultdict(list)
    for teacher in request.teachers:
        for day in days:
            daily = [
                variable
                for period in teaching_periods
                for variable in occupancy.get(("teacher_load", teacher.id, day, period), [])
            ]
            if teacher.max_lessons_per_day is not None and daily:
                model.add(sum(daily) <= teacher.max_lessons_per_day)
                constraints += 1
            if teacher.max_consecutive_lessons is not None:
                window_size = teacher.max_consecutive_lessons + 1
                for start in range(0, len(teaching_periods) - window_size + 1):
                    window = teaching_periods[start : start + window_size]
                    if any(
                        right != left + 1 for left, right in zip(window, window[1:], strict=False)
                    ):
                        continue
                    if (
                        request.schema_version == 2
                        and request.week_configuration
                        and any(
                            crosses_break(
                                left,
                                right,
                                request.week_configuration.break_after_session,
                                teaching_session_by_period,
                            )
                            for left, right in zip(window, window[1:], strict=False)
                        )
                    ):
                        continue
                    window_variables = [
                        variable
                        for period in window
                        for variable in occupancy.get(("teacher_load", teacher.id, day, period), [])
                    ]
                    if window_variables:
                        model.add(sum(window_variables) <= teacher.max_consecutive_lessons)
                        constraints += 1
    for class_section in request.class_sections:
        if class_section.max_lessons_per_day is None:
            continue
        for day in days:
            daily = [
                variable
                for period in teaching_periods
                for variable in occupancy.get(("class", class_section.id, day, period), [])
            ]
            if daily:
                model.add(sum(daily) <= class_section.max_lessons_per_day)
                constraints += 1

    for requirement in request.requirements:
        relax_part_time_distribution = part_time_distribution_can_relax(request, requirement)
        for day in days:
            starts = starts_by_day.get((requirement.id, day), [])
            if starts:
                used = model.new_bool_var(f"used_{requirement.id}_{day}")
                day_used[(requirement.id, day)] = used
                model.add(sum(starts) >= used)
                model.add(sum(starts) <= requirement.occurrence_count * used)
                constraints += 2
                if relax_part_time_distribution:
                    daily_excess = model.new_int_var(
                        0,
                        requirement.occurrence_count,
                        f"part_time_daily_excess_{requirement.id}_{day}",
                    )
                    model.add(daily_excess >= sum(starts) - requirement.daily_occurrence_limit)
                    constraints += 1
                    raw_terms["PART_TIME_DISTRIBUTION_RELAXATION"].append(daily_excess)
                else:
                    model.add(sum(starts) <= requirement.daily_occurrence_limit)
                    constraints += 1
                if (
                    request.schema_version == 2
                    and requirement.is_main_subject
                    and requirement.allow_double_session
                ):
                    subject_break_after_session = class_break_after_session(
                        request,
                        requirement.class_section_id,
                    )
                    adjacent_pairs: list[cp_model.IntVar] = []
                    for left, right in zip(teaching_periods, teaching_periods[1:], strict=False):
                        if right != left + 1:
                            continue
                        if crosses_break(
                            left,
                            right,
                            subject_break_after_session,
                            teaching_session_by_period,
                        ):
                            continue
                        left_starts = starts_by_period.get((requirement.id, day, left), [])
                        right_starts = starts_by_period.get((requirement.id, day, right), [])
                        if not left_starts or not right_starts:
                            continue
                        pair = model.new_bool_var(f"subject_pair_{requirement.id}_{day}_{left}")
                        model.add(pair <= sum(left_starts))
                        model.add(pair <= sum(right_starts))
                        model.add(pair >= sum(left_starts) + sum(right_starts) - 1)
                        constraints += 3
                        adjacent_pairs.append(pair)
                    non_adjacent_double = model.new_int_var(
                        0,
                        1,
                        f"non_adjacent_double_{requirement.id}_{day}",
                    )
                    model.add(non_adjacent_double >= sum(starts) - 1 - sum(adjacent_pairs))
                    constraints += 1
                    raw_terms["MAIN_DOUBLE_ADJACENCY"].append(non_adjacent_double)
        used_variables = [
            day_used[(requirement.id, day)] for day in days if (requirement.id, day) in day_used
        ]
        if relax_part_time_distribution:
            distinct_day_shortage = model.new_int_var(
                0,
                requirement.distinct_day_minimum,
                f"part_time_distinct_day_shortage_{requirement.id}",
            )
            model.add(
                distinct_day_shortage >= requirement.distinct_day_minimum - sum(used_variables)
            )
            constraints += 1
            raw_terms["PART_TIME_DISTRIBUTION_RELAXATION"].append(distinct_day_shortage)
        else:
            model.add(sum(used_variables) >= requirement.distinct_day_minimum)
            constraints += 1

    period_rank = {period: rank for rank, period in enumerate(teaching_periods)}
    first_period = teaching_periods[0] if teaching_periods else -1
    last_period = teaching_periods[-1] if teaching_periods else -1
    subjects = {item.id: item for item in request.subjects}
    preferred_by_teacher: dict[str, set[tuple[int, int]]] = defaultdict(set)
    availability_state = {
        (rule.entity_type, rule.entity_id, rule.day_index, rule.period_index): rule.state
        for rule in request.availability
    }
    for rule in request.availability:
        if rule.entity_type == "TEACHER" and rule.state == "PREFERRED":
            preferred_by_teacher[rule.entity_id].add((rule.day_index, rule.period_index))

    for choice, variable in variables.items():
        requirement = requirement_by_id[choice.requirement_id]
        subject = subjects[requirement.subject_id]
        for offset in range(choice.duration):
            period = choice.period + offset
            state = availability_state.get(("TEACHER", requirement.teacher_id, choice.day, period))
            availability_penalty = int(state == "DISLIKED")
            preferred = preferred_by_teacher.get(requirement.teacher_id)
            if preferred and (choice.day, period) not in preferred:
                availability_penalty += 1
            if availability_penalty:
                raw_terms["TEACHER_AVAILABILITY"].append(availability_penalty * variable)
            if period in (first_period, last_period):
                raw_terms["FIRST_LAST_PERIOD"].append(variable)
            rank = period_rank.get(period, 0)
            if subject.preferred_time_band == "EARLY" and rank:
                raw_terms["LATE_HEAVY_SUBJECT"].append(rank * variable)
            elif subject.preferred_time_band == "LATE":
                late_penalty = len(teaching_periods) - rank - 1
                if late_penalty:
                    raw_terms["LATE_HEAVY_SUBJECT"].append(late_penalty * variable)
            if request.schema_version == 2 and requirement.is_main_subject and rank >= 4:
                raw_terms["MAIN_SUBJECT_LATE_SESSION"].append(variable)

    occupied_indicator: dict[tuple[str, int, int], cp_model.IntVar] = {}
    for teacher in request.teachers:
        total_periods = sum(
            requirement.occurrence_count * requirement.occurrence_duration
            for requirement in request.requirements
            if requirement.teacher_id == teacher.id and not requirement.shared_teaching_group_id
        )
        total_periods += sum(
            requirement.occurrence_count * requirement.occurrence_duration
            for requirement in request.requirements
            if requirement.teacher_id == teacher.id
            and requirement.shared_teaching_group_id
            and requirement.shared_teaching_group_id
            == next(
                (
                    group_id
                    for group_id, members in shared_requirements.items()
                    if requirement.id in members
                ),
                None,
            )
            and requirement.id == shared_requirements[requirement.shared_teaching_group_id][0]
        )
        for day in days:
            daily_indicators: list[cp_model.IntVar] = []
            for period in teaching_periods:
                lesson_candidates = occupancy.get(("teacher_load", teacher.id, day, period), [])
                if not lesson_candidates:
                    continue
                occupied = model.new_bool_var(f"occupied_{teacher.id}_{day}_{period}")
                model.add(occupied == sum(lesson_candidates))
                constraints += 1
                occupied_indicator[(teacher.id, day, period)] = occupied
                daily_indicators.append(occupied)
                raw_terms["TEACHER_CONSECUTIVE_PREFERENCE"].append(occupied)

            for index, period in enumerate(teaching_periods):
                current = occupied_indicator.get((teacher.id, day, period))
                before = [
                    occupied_indicator[(teacher.id, day, earlier)]
                    for earlier in teaching_periods[:index]
                    if (teacher.id, day, earlier) in occupied_indicator
                ]
                after = [
                    occupied_indicator[(teacher.id, day, later)]
                    for later in teaching_periods[index + 1 :]
                    if (teacher.id, day, later) in occupied_indicator
                ]
                if current is None or not before or not after:
                    continue
                has_before = model.new_bool_var(f"before_{teacher.id}_{day}_{period}")
                has_after = model.new_bool_var(f"after_{teacher.id}_{day}_{period}")
                gap = model.new_bool_var(f"gap_{teacher.id}_{day}_{period}")
                model.add_max_equality(has_before, before)
                model.add_max_equality(has_after, after)
                model.add(gap <= has_before)
                model.add(gap <= has_after)
                model.add(gap + current <= 1)
                model.add(gap >= has_before + has_after - current - 1)
                constraints += 6
                raw_terms["TEACHER_GAP"].append(gap)
                if teacher.employment_type == "PART_TIME":
                    raw_terms["PART_TIME_COMPACTNESS"].append(gap)

            for left, right in zip(teaching_periods, teaching_periods[1:], strict=False):
                if right != left + 1:
                    continue
                left_var = occupied_indicator.get((teacher.id, day, left))
                right_var = occupied_indicator.get((teacher.id, day, right))
                if left_var is None or right_var is None:
                    continue
                adjacent = model.new_bool_var(f"adjacent_{teacher.id}_{day}_{left}")
                model.add(adjacent <= left_var)
                model.add(adjacent <= right_var)
                model.add(adjacent >= left_var + right_var - 1)
                constraints += 3
                raw_terms["TEACHER_CONSECUTIVE_PREFERENCE"].append(-adjacent)

            if days and total_periods > 0:
                imbalance = model.new_int_var(
                    0,
                    total_periods * len(days),
                    f"imbalance_{teacher.id}_{day}",
                )
                model.add_abs_equality(
                    imbalance,
                    sum(daily_indicators) * len(days) - total_periods,
                )
                constraints += 1
                balance_code = (
                    "FULL_TIME_DAILY_BALANCE"
                    if request.schema_version == 2 and teacher.employment_type == "FULL_TIME"
                    else "DAILY_WORKLOAD_BALANCE"
                )
                if request.schema_version == 1 or teacher.employment_type == "FULL_TIME":
                    raw_terms[balance_code].append(imbalance)

    for requirement in request.requirements:
        requirement_used = [
            day_used[(requirement.id, day)] for day in days if (requirement.id, day) in day_used
        ]
        if requirement_used:
            repeat_penalty = model.new_int_var(
                0,
                requirement.occurrence_count,
                f"repeat_{requirement.id}",
            )
            model.add(repeat_penalty == requirement.occurrence_count - sum(requirement_used))
            constraints += 1
            raw_terms["SUBJECT_SPREAD"].append(repeat_penalty)
            raw_terms["REPEATED_SUBJECT_DAY"].append(repeat_penalty)

    weighted_terms: list[cp_model.LinearExpr] = []
    for code in SOFT_CONSTRAINT_CODES:
        weight = request.constraint_profile.weights.get(code, 0)
        if weight > 0 and raw_terms.get(code):
            weighted_terms.append(
                cp_model.LinearExpr.weighted_sum(
                    raw_terms[code],
                    [weight] * len(raw_terms[code]),
                )
            )
    quality_expression = sum(weighted_terms)
    existing_positions = {
        (
            assignment.requirement_id,
            assignment.day_index,
            assignment.period_index,
            assignment.room_id,
        )
        for assignment in request.existing_assignments
    }
    movement_terms = [
        variable
        for choice, variable in variables.items()
        if request.options.use_existing_schedule_hint
        and (
            choice.requirement_id,
            choice.day,
            choice.period,
            choice.room_id,
        )
        not in existing_positions
    ]
    movement_expression = sum(movement_terms)
    objective_expression = quality_expression + movement_expression
    if weighted_terms or movement_terms:
        model.minimize(objective_expression)
    if request.options.use_existing_schedule_hint:
        for choice, variable in variables.items():
            model.add_hint(
                variable,
                int(
                    (
                        choice.requirement_id,
                        choice.day,
                        choice.period,
                        choice.room_id,
                    )
                    in existing_positions
                ),
            )

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = request.options.time_limit_seconds
    solver.parameters.random_seed = request.options.random_seed
    solver.parameters.num_search_workers = 8
    first_started = time.monotonic()
    status = solver.solve(model)
    first_runtime_ms = round((time.monotonic() - first_started) * 1000)
    if status == cp_model.INFEASIBLE:
        return _infeasible(request, started, len(variables), constraints)
    if status not in (cp_model.FEASIBLE, cp_model.OPTIMAL):
        status_name = solver.status_name(status)
        return SolveResponse(
            schema_version=request.schema_version,
            job_id=request.job_id,
            input_fingerprint=input_fingerprint(request),
            status="FAILED",
            runtime_ms=round((time.monotonic() - started) * 1000),
            alternatives=[],
            diagnostics=[
                {
                    "code": (
                        "SOLVER_TIME_LIMIT_REACHED"
                        if status == cp_model.UNKNOWN
                        else "SOLVER_MODEL_INVALID"
                    ),
                    "summary": (
                        "The solver reached its time limit without proving "
                        "feasibility or infeasibility."
                        if status == cp_model.UNKNOWN
                        else "The solver rejected the generated constraint model."
                    ),
                    "solverStatus": status_name,
                    "timeLimitSeconds": request.options.time_limit_seconds,
                }
            ],
            warnings=[],
            variable_count=len(variables),
            constraint_count=constraints,
        )

    selected = {choice for choice, variable in variables.items() if solver.boolean_value(variable)}
    assignments = _assignments_from_choices(selected)
    validation_errors = validate_assignments(request, assignments)
    if validation_errors:
        return SolveResponse(
            schema_version=request.schema_version,
            job_id=request.job_id,
            input_fingerprint=input_fingerprint(request),
            status="FAILED",
            runtime_ms=round((time.monotonic() - started) * 1000),
            alternatives=[],
            diagnostics=[{"code": "POST_SOLVE_VALIDATION_FAILED", "errors": validation_errors}],
            warnings=[],
            variable_count=len(variables),
            constraint_count=constraints,
        )
    score = score_assignments(request, assignments)
    movement_penalty = (
        sum(
            1
            for assignment in assignments
            if (
                assignment.requirement_id,
                assignment.day_index,
                assignment.period_index,
                assignment.room_id,
            )
            not in existing_positions
        )
        if request.options.use_existing_schedule_hint
        else 0
    )
    expected_objective = score.total + (
        movement_penalty if request.options.use_existing_schedule_hint else 0
    )
    if (weighted_terms or movement_terms) and round(solver.objective_value) != expected_objective:
        return SolveResponse(
            schema_version=request.schema_version,
            job_id=request.job_id,
            input_fingerprint=input_fingerprint(request),
            status="FAILED",
            runtime_ms=round((time.monotonic() - started) * 1000),
            alternatives=[],
            diagnostics=[
                {
                    "code": "PENALTY_BREAKDOWN_MISMATCH",
                    "objective": round(solver.objective_value),
                    "breakdownTotal": expected_objective,
                }
            ],
            warnings=[],
            variable_count=len(variables),
            constraint_count=constraints,
        )
    first_status: Literal["FEASIBLE", "OPTIMAL"] = (
        "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE"
    )
    alternatives = [
        Alternative(
            rank=1,
            solver_status=first_status,
            total_penalty=score.total,
            diversity_score=0,
            penalty_breakdown=score.breakdown,
            assignments=assignments,
            movement_penalty=movement_penalty,
            moved_assignments=(
                _moved_assignments(request.existing_assignments, assignments)
                if request.options.use_existing_schedule_hint
                else []
            ),
            runtime_ms=first_runtime_ms,
            warnings=_part_time_distribution_warnings(request, assignments),
        )
    ]
    previous_selections = [selected]
    occurrence_count = len(selected)
    quality_limit = score.total * (100 + request.options.max_quality_degradation_percent) // 100
    if weighted_terms:
        model.add(quality_expression <= quality_limit)
        constraints += 1

    for rank in range(2, request.options.alternative_count + 1):
        for previous in previous_selections[-1:]:
            model.add(sum(variables[choice] for choice in previous) <= occurrence_count - 1)
            constraints += 1
        diversity_terms = [
            variable
            for choice, variable in variables.items()
            for previous in previous_selections
            if choice not in previous
        ]
        if not diversity_terms:
            break
        model.maximize(sum(diversity_terms))
        alternative_solver = cp_model.CpSolver()
        alternative_solver.parameters.max_time_in_seconds = request.options.time_limit_seconds
        alternative_solver.parameters.random_seed = request.options.random_seed + rank
        alternative_solver.parameters.num_search_workers = 1
        alternative_started = time.monotonic()
        alternative_status_code = alternative_solver.solve(model)
        alternative_runtime_ms = round((time.monotonic() - alternative_started) * 1000)
        if alternative_status_code not in (cp_model.FEASIBLE, cp_model.OPTIMAL):
            break
        alternative_selected = {
            choice
            for choice, variable in variables.items()
            if alternative_solver.boolean_value(variable)
        }
        alternative_assignments = _assignments_from_choices(alternative_selected)
        alternative_errors = validate_assignments(request, alternative_assignments)
        if alternative_errors:
            return SolveResponse(
                schema_version=request.schema_version,
                job_id=request.job_id,
                input_fingerprint=input_fingerprint(request),
                status="FAILED",
                runtime_ms=round((time.monotonic() - started) * 1000),
                alternatives=[],
                diagnostics=[
                    {
                        "code": "POST_SOLVE_VALIDATION_FAILED",
                        "errors": alternative_errors,
                        "rank": rank,
                    }
                ],
                warnings=[],
                variable_count=len(variables),
                constraint_count=constraints,
            )
        alternative_score = score_assignments(request, alternative_assignments)
        if alternative_score.total > quality_limit:
            return SolveResponse(
                schema_version=request.schema_version,
                job_id=request.job_id,
                input_fingerprint=input_fingerprint(request),
                status="FAILED",
                runtime_ms=round((time.monotonic() - started) * 1000),
                alternatives=[],
                diagnostics=[
                    {
                        "code": "ALTERNATIVE_QUALITY_LIMIT_VIOLATION",
                        "rank": rank,
                        "qualityLimit": quality_limit,
                        "actual": alternative_score.total,
                    }
                ],
                warnings=[],
                variable_count=len(variables),
                constraint_count=constraints,
            )
        diversity_score = sum(
            len(alternative_selected - previous) for previous in previous_selections
        )
        alternative_status: Literal["FEASIBLE", "OPTIMAL"] = (
            "OPTIMAL" if alternative_status_code == cp_model.OPTIMAL else "FEASIBLE"
        )
        alternatives.append(
            Alternative(
                rank=rank,
                solver_status=alternative_status,
                total_penalty=alternative_score.total,
                diversity_score=diversity_score,
                penalty_breakdown=alternative_score.breakdown,
                assignments=alternative_assignments,
                movement_penalty=(
                    sum(
                        1
                        for assignment in alternative_assignments
                        if (
                            assignment.requirement_id,
                            assignment.day_index,
                            assignment.period_index,
                            assignment.room_id,
                        )
                        not in existing_positions
                    )
                    if request.options.use_existing_schedule_hint
                    else 0
                ),
                moved_assignments=(
                    _moved_assignments(request.existing_assignments, alternative_assignments)
                    if request.options.use_existing_schedule_hint
                    else []
                ),
                runtime_ms=alternative_runtime_ms,
                warnings=_part_time_distribution_warnings(request, alternative_assignments),
            )
        )
        previous_selections.append(alternative_selected)

    warnings = []
    if len(alternatives) < request.options.alternative_count:
        warnings.append("Fewer distinct alternatives were available within the quality limit.")
    return SolveResponse(
        schema_version=request.schema_version,
        job_id=request.job_id,
        input_fingerprint=input_fingerprint(request),
        status=first_status,
        runtime_ms=round((time.monotonic() - started) * 1000),
        alternatives=alternatives,
        diagnostics=[],
        warnings=warnings,
        variable_count=len(variables),
        constraint_count=constraints,
    )


def _assignments_from_choices(choices: set[Choice]) -> list[Assignment]:
    assignments = [
        Assignment(
            requirement_id=choice.requirement_id,
            day_index=choice.day,
            period_index=choice.period,
            duration_periods=choice.duration,
            room_id=choice.room_id,
        )
        for choice in choices
    ]
    assignments.sort(key=lambda item: (item.day_index, item.period_index, item.requirement_id))
    return assignments


def _part_time_distribution_warnings(
    request: SolveRequest,
    assignments: list[Assignment],
) -> list[str]:
    teachers = {item.id: item for item in request.teachers}
    subjects = {item.id: item for item in request.subjects}
    class_sections = {item.id: item for item in request.class_sections}
    assignments_by_requirement_day: dict[tuple[str, int], list[Assignment]] = defaultdict(list)
    days_by_requirement: dict[str, set[int]] = defaultdict(set)
    for assignment in assignments:
        assignments_by_requirement_day[(assignment.requirement_id, assignment.day_index)].append(
            assignment
        )
        days_by_requirement[assignment.requirement_id].add(assignment.day_index)

    warnings: list[str] = []
    for requirement in request.requirements:
        if not part_time_distribution_can_relax(request, requirement):
            continue
        repeated_days = [
            day
            for (requirement_id, day), daily_assignments in assignments_by_requirement_day.items()
            if requirement_id == requirement.id
            and len(daily_assignments) > requirement.daily_occurrence_limit
        ]
        distinct_shortage = max(
            0,
            requirement.distinct_day_minimum - len(days_by_requirement.get(requirement.id, set())),
        )
        if not repeated_days and distinct_shortage == 0:
            continue
        teacher = teachers[requirement.teacher_id]
        subject = subjects[requirement.subject_id]
        class_section = class_sections[requirement.class_section_id]
        warnings.append(
            f"PART_TIME_DISTRIBUTION_RELAXED:{teacher.name}:{class_section.name}:{subject.name}"
        )
    return warnings


def _moved_assignments(before: list[Assignment], after: list[Assignment]) -> list[MovedAssignment]:
    moved: list[MovedAssignment] = []
    requirement_ids = sorted(
        {assignment.requirement_id for assignment in before}
        | {assignment.requirement_id for assignment in after}
    )
    for requirement_id in requirement_ids:
        old_positions = sorted(
            (assignment.day_index, assignment.period_index)
            for assignment in before
            if assignment.requirement_id == requirement_id
        )
        new_positions = sorted(
            (assignment.day_index, assignment.period_index)
            for assignment in after
            if assignment.requirement_id == requirement_id
        )
        unchanged = set(old_positions) & set(new_positions)
        old_changed = [position for position in old_positions if position not in unchanged]
        new_changed = [position for position in new_positions if position not in unchanged]
        for old, new in zip(old_changed, new_changed, strict=False):
            moved.append(
                MovedAssignment(
                    requirement_id=requirement_id,
                    before=Position(day_index=old[0], period_index=old[1]),
                    after=Position(day_index=new[0], period_index=new[1]),
                )
            )
    return moved


def _shared_group_diagnostics(request: SolveRequest) -> list[dict[str, object]]:
    if request.schema_version != 2:
        return []

    requirements_by_group: dict[str, list[Requirement]] = defaultdict(list)
    for requirement in request.requirements:
        if requirement.shared_teaching_group_id:
            requirements_by_group[requirement.shared_teaching_group_id].append(requirement)

    class_sections = {item.id: item for item in request.class_sections}
    subjects = {item.id: item for item in request.subjects}
    diagnostics: list[dict[str, object]] = []
    for group_id, requirements in sorted(requirements_by_group.items()):
        if len(requirements) < 2:
            diagnostics.append(
                {
                    "code": "SHARED_GROUP_TOO_SMALL",
                    "summary": "A shared teaching group has fewer than two members.",
                    "sharedTeachingGroupId": group_id,
                }
            )
            continue

        common_positions: set[tuple[int, int, str | None]] | None = None
        for requirement in requirements:
            positions = {
                (choice.day, choice.period, choice.room_id)
                for choice in compatible_choices(request, requirement, 0)
                if all(
                    class_session_interval(
                        request,
                        requirement.class_section_id,
                        choice.period,
                        choice.duration,
                    )
                    == class_session_interval(
                        request,
                        other.class_section_id,
                        choice.period,
                        choice.duration,
                    )
                    for other in requirements
                )
            }
            common_positions = (
                positions if common_positions is None else common_positions & positions
            )

        required = requirements[0].occurrence_count
        available = len(common_positions or set())
        if available < required:
            class_names = [class_sections[item.class_section_id].name for item in requirements]
            subject_name = subjects[requirements[0].subject_id].name
            diagnostics.append(
                {
                    "code": "SHARED_GROUP_PLACEMENT_SHORTAGE",
                    "summary": (
                        f"{subject_name} shared group for {', '.join(class_names)} "
                        f"needs {required} synchronized sessions but has {available} "
                        "common valid positions."
                    ),
                    "sharedTeachingGroupId": group_id,
                    "required": required,
                    "available": available,
                    "classSectionIds": [item.class_section_id for item in requirements],
                    "requirementIds": [item.id for item in requirements],
                }
            )
    return diagnostics


def _teacher_overlap_examples(
    request: SolveRequest,
    teacher_id: str,
    requirements: list[Requirement],
) -> list[dict[str, object]]:
    model = cp_model.CpModel()
    variables: dict[Choice, cp_model.IntVar] = {}
    starts_by_requirement: dict[str, list[cp_model.IntVar]] = defaultdict(list)
    starts_by_requirement_day: dict[tuple[str, int], list[cp_model.IntVar]] = defaultdict(list)
    day_used: dict[tuple[str, int], cp_model.IntVar] = {}
    events: list[tuple[Choice, Requirement, cp_model.IntVar, tuple[int, int]]] = []
    days = [day.index for day in request.calendar.days if day.is_working]

    for requirement in requirements:
        for choice in compatible_choices(request, requirement, 0):
            variable = model.new_bool_var(
                f"overlap_{teacher_id}_{requirement.id}_{choice.day}_{choice.period}"
            )
            variables[choice] = variable
            starts_by_requirement[requirement.id].append(variable)
            starts_by_requirement_day[(requirement.id, choice.day)].append(variable)
            events.append(
                (
                    choice,
                    requirement,
                    variable,
                    class_session_interval(
                        request,
                        requirement.class_section_id,
                        choice.period,
                        choice.duration,
                    ),
                )
            )
        model.add(sum(starts_by_requirement[requirement.id]) == requirement.occurrence_count)
        relax_part_time_distribution = part_time_distribution_can_relax(request, requirement)
        for day in days:
            starts = starts_by_requirement_day.get((requirement.id, day), [])
            if not starts:
                continue
            if not relax_part_time_distribution:
                model.add(sum(starts) <= requirement.daily_occurrence_limit)
            used = model.new_bool_var(f"overlap_used_{requirement.id}_{day}")
            day_used[(requirement.id, day)] = used
            model.add(sum(starts) >= used)
            used_limit = (
                requirement.occurrence_count
                if relax_part_time_distribution
                else requirement.daily_occurrence_limit
            )
            model.add(sum(starts) <= used_limit * used)
        if not relax_part_time_distribution:
            used_variables = [
                day_used[(requirement.id, day)] for day in days if (requirement.id, day) in day_used
            ]
            model.add(sum(used_variables) >= requirement.distinct_day_minimum)

    overlap_terms: list[cp_model.IntVar] = []
    overlap_pairs: list[
        tuple[
            cp_model.IntVar,
            tuple[Choice, Requirement, tuple[int, int]],
            tuple[Choice, Requirement, tuple[int, int]],
        ]
    ] = []
    for index, left_event in enumerate(events):
        for right_event in events[index + 1 :]:
            left_choice, left_requirement, left_variable, left_interval = left_event
            right_choice, right_requirement, right_variable, right_interval = right_event
            if left_choice.day != right_choice.day:
                continue
            same_shared_event = (
                left_requirement.shared_teaching_group_id is not None
                and left_requirement.shared_teaching_group_id
                == right_requirement.shared_teaching_group_id
                and left_choice.period == right_choice.period
                and left_choice.room_id == right_choice.room_id
                and left_interval == right_interval
            )
            if same_shared_event or not intervals_overlap(left_interval, right_interval):
                continue
            overlap = model.new_bool_var(
                f"overlap_pair_{len(overlap_terms)}_{left_choice.day}_{left_choice.period}"
            )
            model.add(overlap <= left_variable)
            model.add(overlap <= right_variable)
            model.add(overlap >= left_variable + right_variable - 1)
            overlap_terms.append(overlap)
            overlap_pairs.append(
                (
                    overlap,
                    (left_choice, left_requirement, left_interval),
                    (right_choice, right_requirement, right_interval),
                )
            )
    if overlap_terms:
        model.minimize(sum(overlap_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 2
    solver.parameters.num_search_workers = 1
    status = solver.solve(model)
    if status not in (cp_model.FEASIBLE, cp_model.OPTIMAL):
        return []

    class_sections = {item.id: item for item in request.class_sections}
    subjects = {item.id: item for item in request.subjects}
    examples: list[dict[str, object]] = []
    for overlap, left, right in overlap_pairs:
        if not solver.boolean_value(overlap):
            continue
        left_choice, left_requirement, left_interval = left
        right_choice, right_requirement, right_interval = right
        examples.append(
            {
                "dayIndex": left_choice.day,
                "left": {
                    "requirementId": left_requirement.id,
                    "className": class_sections[left_requirement.class_section_id].name,
                    "subjectName": subjects[left_requirement.subject_id].name,
                    "session": left_choice.period + 1,
                    "startsAtMinutes": left_interval[0],
                    "endsAtMinutes": left_interval[1],
                },
                "right": {
                    "requirementId": right_requirement.id,
                    "className": class_sections[right_requirement.class_section_id].name,
                    "subjectName": subjects[right_requirement.subject_id].name,
                    "session": right_choice.period + 1,
                    "startsAtMinutes": right_interval[0],
                    "endsAtMinutes": right_interval[1],
                },
            }
        )
        if len(examples) >= MAX_DIAGNOSTIC_OVERLAPS:
            break
    return examples


def _resource_packing_diagnostic(
    request: SolveRequest,
    *,
    resource_type: Literal["TEACHER", "CLASS_SECTION"],
    resource_id: str,
    requirements: list[Requirement],
) -> dict[str, object] | None:
    model = cp_model.CpModel()
    variables: dict[Choice, cp_model.IntVar] = {}
    starts_by_requirement_day: dict[tuple[str, int], list[cp_model.IntVar]] = defaultdict(list)
    starts_by_requirement: dict[str, list[cp_model.IntVar]] = defaultdict(list)
    occupied_by_position: dict[tuple[int, int], list[cp_model.IntVar]] = defaultdict(list)
    teacher_events: list[tuple[Choice, Requirement, cp_model.IntVar, tuple[int, int]]] = []
    days = [day.index for day in request.calendar.days if day.is_working]

    for requirement in requirements:
        choices = compatible_choices(request, requirement, 0)
        for choice in choices:
            variable = model.new_bool_var(
                f"pack_{resource_type}_{resource_id}_{requirement.id}_{choice.day}_{choice.period}"
            )
            variables[choice] = variable
            starts_by_requirement[requirement.id].append(variable)
            starts_by_requirement_day[(requirement.id, choice.day)].append(variable)
            for offset in range(choice.duration):
                if resource_type == "CLASS_SECTION":
                    occupied_by_position[(choice.day, choice.period + offset)].append(variable)
            if resource_type == "TEACHER":
                teacher_events.append(
                    (
                        choice,
                        requirement,
                        variable,
                        class_session_interval(
                            request,
                            requirement.class_section_id,
                            choice.period,
                            choice.duration,
                        ),
                    )
                )

        model.add(sum(starts_by_requirement[requirement.id]) == requirement.occurrence_count)
        relax_part_time_distribution = part_time_distribution_can_relax(request, requirement)
        for day in days:
            starts = starts_by_requirement_day.get((requirement.id, day), [])
            if starts and not relax_part_time_distribution:
                model.add(sum(starts) <= requirement.daily_occurrence_limit)
        used_days: list[cp_model.IntVar] = []
        for day in days:
            starts = starts_by_requirement_day.get((requirement.id, day), [])
            if not starts:
                continue
            used = model.new_bool_var(f"pack_used_{requirement.id}_{day}")
            model.add(sum(starts) >= used)
            used_limit = (
                requirement.occurrence_count
                if relax_part_time_distribution
                else requirement.daily_occurrence_limit
            )
            model.add(sum(starts) <= used_limit * used)
            used_days.append(used)
        if not relax_part_time_distribution:
            model.add(sum(used_days) >= requirement.distinct_day_minimum)

    for position_variables in occupied_by_position.values():
        if len(position_variables) > 1:
            model.add(sum(position_variables) <= 1)

    if resource_type == "TEACHER":
        for index, left_event in enumerate(teacher_events):
            for right_event in teacher_events[index + 1 :]:
                left_choice, left_requirement, left_variable, left_interval = left_event
                right_choice, right_requirement, right_variable, right_interval = right_event
                if left_choice.day != right_choice.day:
                    continue
                same_shared_event = (
                    left_requirement.shared_teaching_group_id is not None
                    and left_requirement.shared_teaching_group_id
                    == right_requirement.shared_teaching_group_id
                    and left_choice.period == right_choice.period
                    and left_choice.room_id == right_choice.room_id
                    and left_interval == right_interval
                )
                if not same_shared_event and intervals_overlap(left_interval, right_interval):
                    model.add(left_variable + right_variable <= 1)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 2
    solver.parameters.num_search_workers = 1
    status = solver.solve(model)
    if status in (cp_model.FEASIBLE, cp_model.OPTIMAL):
        return None
    if status != cp_model.INFEASIBLE:
        return None

    teachers = {item.id: item for item in request.teachers}
    class_sections = {item.id: item for item in request.class_sections}
    subjects = {item.id: item for item in request.subjects}
    if resource_type == "TEACHER":
        resource_name = teachers[resource_id].name
        code = "TEACHER_PACKING_CONFLICT"
    else:
        resource_name = class_sections[resource_id].name
        code = "CLASS_PACKING_CONFLICT"

    demand = sum(requirement.occurrence_count for requirement in requirements)
    requirement_details = [
        {
            "requirementId": requirement.id,
            "classSectionId": requirement.class_section_id,
            "className": class_sections[requirement.class_section_id].name,
            "subjectId": requirement.subject_id,
            "subjectName": subjects[requirement.subject_id].name,
            "teacherId": requirement.teacher_id,
            "teacherName": teachers[requirement.teacher_id].name,
            "weeklySessions": requirement.occurrence_count,
            "dailyLimit": requirement.daily_occurrence_limit,
            "distinctDayMinimum": requirement.distinct_day_minimum,
            "compatibleStarts": len(compatible_choices(request, requirement, 0)),
        }
        for requirement in requirements
    ]
    all_distribution_relaxed = all(
        part_time_distribution_can_relax(request, requirement) for requirement in requirements
    )
    reason = (
        "current hard availability and real-time collision rules"
        if resource_type == "TEACHER" and all_distribution_relaxed
        else "current hard availability, real-time collision, daily limit, and distinct-day rules"
    )
    return {
        "code": code,
        "summary": f"{resource_name} cannot pack {demand} required sessions into the {reason}.",
        "resourceType": resource_type,
        "resourceId": resource_id,
        "resourceName": resource_name,
        "required": demand,
        "requirements": requirement_details[:MAX_DIAGNOSTIC_REQUIREMENTS],
        "requirementCount": len(requirement_details),
        "overlapExamples": (
            _teacher_overlap_examples(request, resource_id, requirements)
            if resource_type == "TEACHER"
            else []
        ),
    }


def _packing_diagnostics(request: SolveRequest) -> list[dict[str, object]]:
    diagnostics: list[dict[str, object]] = []
    requirements_by_teacher: dict[str, list[Requirement]] = defaultdict(list)
    requirements_by_class: dict[str, list[Requirement]] = defaultdict(list)
    teachers = {teacher.id: teacher for teacher in request.teachers}
    constrained_teacher_ids = {
        rule.entity_id
        for rule in request.availability
        if rule.entity_type == "TEACHER" and rule.state == "UNAVAILABLE"
    }
    shared_requirements: dict[str, list[str]] = defaultdict(list)
    for requirement in request.requirements:
        if requirement.shared_teaching_group_id:
            shared_requirements[requirement.shared_teaching_group_id].append(requirement.id)
    shared_representatives = {
        requirement_ids[0] for requirement_ids in shared_requirements.values() if requirement_ids
    }

    for requirement in request.requirements:
        teacher = teachers[requirement.teacher_id]
        if (
            teacher.employment_type == "PART_TIME"
            and requirement.teacher_id in constrained_teacher_ids
            and (
                not requirement.shared_teaching_group_id or requirement.id in shared_representatives
            )
        ):
            requirements_by_teacher[requirement.teacher_id].append(requirement)
        requirements_by_class[requirement.class_section_id].append(requirement)

    sorted_teacher_items = sorted(
        requirements_by_teacher.items(),
        key=lambda item: (
            teachers[item[0]].employment_type != "PART_TIME",
            teachers[item[0]].name,
        ),
    )
    for teacher_id, requirements in sorted_teacher_items:
        diagnostic = _resource_packing_diagnostic(
            request,
            resource_type="TEACHER",
            resource_id=teacher_id,
            requirements=requirements,
        )
        if diagnostic:
            diagnostics.append(diagnostic)
        if len(diagnostics) >= MAX_STRUCTURAL_DIAGNOSTICS:
            return diagnostics
    for class_section_id, requirements in sorted(requirements_by_class.items()):
        diagnostic = _resource_packing_diagnostic(
            request,
            resource_type="CLASS_SECTION",
            resource_id=class_section_id,
            requirements=requirements,
        )
        if diagnostic:
            diagnostics.append(diagnostic)
        if len(diagnostics) >= MAX_STRUCTURAL_DIAGNOSTICS:
            return diagnostics
    return diagnostics


def _diagnose_infeasibility(request: SolveRequest) -> list[dict[str, object]]:
    diagnostics: list[dict[str, object]] = []
    choices_by_occurrence: dict[tuple[str, int], list[Choice]] = {}
    requirement_by_id = {requirement.id: requirement for requirement in request.requirements}
    for requirement in request.requirements:
        for occurrence in range(requirement.occurrence_count):
            choices = compatible_choices(request, requirement, occurrence)
            choices_by_occurrence[(requirement.id, occurrence)] = choices
            if not choices:
                diagnostics.append(
                    {
                        "code": "NO_COMPATIBLE_PLACEMENT",
                        "summary": "A required lesson has no compatible start slot.",
                        "requirementId": requirement.id,
                        "occurrence": occurrence,
                    }
                )
    if diagnostics:
        return diagnostics

    locked_errors = validate_assignments(
        request,
        request.locked_assignments,
        allow_incomplete=True,
    )
    if locked_errors:
        return [
            {
                "code": "LOCKED_ASSIGNMENT_CONFLICT",
                "summary": "Locked assignments conflict with a hard constraint.",
                "errors": locked_errors,
            }
        ]

    structural_diagnostics = _shared_group_diagnostics(request) + _packing_diagnostics(request)
    if structural_diagnostics:
        return structural_diagnostics[:MAX_STRUCTURAL_DIAGNOSTICS]

    diagnostic_model = cp_model.CpModel()
    variables: dict[Choice, cp_model.IntVar] = {}
    for occurrence_key, choices in choices_by_occurrence.items():
        occurrence_variables: list[cp_model.IntVar] = []
        for choice in choices:
            variable = diagnostic_model.new_bool_var(
                f"diagnostic_{occurrence_key[0]}_{occurrence_key[1]}_{choice.day}_{choice.period}"
            )
            variables[choice] = variable
            occurrence_variables.append(variable)
        diagnostic_model.add_exactly_one(occurrence_variables)

    occupancy: dict[tuple[str, str, int, int], list[cp_model.IntVar]] = defaultdict(list)
    for choice, variable in variables.items():
        requirement = requirement_by_id[choice.requirement_id]
        for offset in range(choice.duration):
            period = choice.period + offset
            occupancy[("TEACHER", requirement.teacher_id, choice.day, period)].append(variable)
            occupancy[("CLASS_SECTION", requirement.class_section_id, choice.day, period)].append(
                variable
            )
            if choice.room_id:
                occupancy[("ROOM", choice.room_id, choice.day, period)].append(variable)

    overflow_by_resource: dict[tuple[str, str, int, int], cp_model.IntVar] = {}
    for resource, candidates in occupancy.items():
        if len(candidates) < 2:
            continue
        overflow = diagnostic_model.new_int_var(0, len(candidates) - 1, "overflow")
        diagnostic_model.add(overflow >= sum(candidates) - 1)
        overflow_by_resource[resource] = overflow
    if overflow_by_resource:
        diagnostic_model.minimize(sum(overflow_by_resource.values()))
        diagnostic_solver = cp_model.CpSolver()
        diagnostic_solver.parameters.max_time_in_seconds = min(
            5, request.options.time_limit_seconds
        )
        diagnostic_solver.parameters.num_search_workers = 1
        status = diagnostic_solver.solve(diagnostic_model)
        if status in (cp_model.FEASIBLE, cp_model.OPTIMAL):
            conflicts = [
                {
                    "resourceType": resource[0],
                    "resourceId": resource[1],
                    "dayIndex": resource[2],
                    "periodIndex": resource[3],
                    "overlap": diagnostic_solver.value(overflow),
                }
                for resource, overflow in sorted(overflow_by_resource.items())
                if diagnostic_solver.value(overflow) > 0
            ]
            if conflicts:
                return [
                    {
                        "code": "RESOURCE_COLLISION_RELAXATION",
                        "summary": "The smallest relaxed model still requires resource collisions.",
                        "conflicts": conflicts,
                    }
                ]
    return [
        {
            "code": "HARD_CONSTRAINT_GROUP_CONFLICT",
            "summary": "Daily limits or distribution rules conflict as a group.",
            "groups": [
                "DAILY_LIMITS",
                "DISTINCT_DAYS",
                "FIXED_AND_FORBIDDEN_SLOTS",
                "RESOURCE_CAPACITY",
            ],
        }
    ]


def _infeasible(
    request: SolveRequest, started: float, variable_count: int, constraint_count: int
) -> SolveResponse:
    return SolveResponse(
        schema_version=request.schema_version,
        job_id=request.job_id,
        input_fingerprint=input_fingerprint(request),
        status="INFEASIBLE",
        runtime_ms=round((time.monotonic() - started) * 1000),
        alternatives=[],
        diagnostics=_diagnose_infeasibility(request),
        warnings=[],
        variable_count=variable_count,
        constraint_count=constraint_count,
    )
