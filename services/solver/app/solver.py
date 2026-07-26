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
    Position,
    Requirement,
    SolveRequest,
    SolveResponse,
)
from app.scoring import SOFT_CONSTRAINT_CODES, score_assignments
from app.validator import validate_assignments


@dataclass(frozen=True)
class Choice:
    requirement_id: str
    occurrence: int
    day: int
    period: int
    room_id: str | None
    duration: int


def input_fingerprint(request: SolveRequest) -> str:
    data = request.model_dump(by_alias=True, exclude={"job_id"})
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

    choices: list[Choice] = []
    for day, period in sorted(enabled):
        if fixed and (day != fixed.day_index or period != fixed.period_index):
            continue
        if (day, period) in forbidden:
            continue
        for room_id in rooms:
            valid = True
            for offset in range(requirement.duration_periods):
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
                        requirement.duration_periods,
                    )
                )
    return choices


def solve(request: SolveRequest) -> SolveResponse:
    started = time.monotonic()
    model = cp_model.CpModel()
    variables: dict[Choice, cp_model.IntVar] = {}
    constraints = 0
    requirement_by_id = {item.id: item for item in request.requirements}

    for requirement in request.requirements:
        for occurrence in range(requirement.weekly_occurrences):
            choices = compatible_choices(request, requirement, occurrence)
            occurrence_variables = []
            for choice in choices:
                variable = model.new_bool_var(
                    f"x_{requirement.id}_{occurrence}_{choice.day}_{choice.period}_{choice.room_id}"
                )
                variables[choice] = variable
                occurrence_variables.append(variable)
            if not occurrence_variables:
                return _infeasible(request, started, len(variables), constraints)
            model.add_exactly_one(occurrence_variables)
            constraints += 1

    occupancy: dict[tuple[str, str, int, int], list[cp_model.IntVar]] = defaultdict(list)
    starts_by_day: dict[tuple[str, int], list[cp_model.IntVar]] = defaultdict(list)
    day_used: dict[tuple[str, int], cp_model.IntVar] = {}
    for choice, variable in variables.items():
        requirement = requirement_by_id[choice.requirement_id]
        starts_by_day[(choice.requirement_id, choice.day)].append(variable)
        for offset in range(choice.duration):
            period = choice.period + offset
            occupancy[("teacher", requirement.teacher_id, choice.day, period)].append(variable)
            occupancy[("class", requirement.class_section_id, choice.day, period)].append(variable)
            if choice.room_id:
                occupancy[("room", choice.room_id, choice.day, period)].append(variable)
    for conflict_variables in occupancy.values():
        if len(conflict_variables) > 1:
            model.add(sum(conflict_variables) <= 1)
            constraints += 1

    days = [day.index for day in request.calendar.days if day.is_working]
    teaching_periods = sorted(
        period.index for period in request.calendar.periods if period.is_teaching
    )
    for teacher in request.teachers:
        for day in days:
            daily = [
                variable
                for period in teaching_periods
                for variable in occupancy.get(("teacher", teacher.id, day, period), [])
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
                    window_variables = [
                        variable
                        for period in window
                        for variable in occupancy.get(("teacher", teacher.id, day, period), [])
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
        for day in days:
            starts = starts_by_day.get((requirement.id, day), [])
            if starts:
                model.add(sum(starts) <= requirement.max_occurrences_per_day)
                constraints += 1
                used = model.new_bool_var(f"used_{requirement.id}_{day}")
                day_used[(requirement.id, day)] = used
                model.add(sum(starts) >= used)
                model.add(sum(starts) <= requirement.max_occurrences_per_day * used)
                constraints += 2
        used_variables = [
            day_used[(requirement.id, day)] for day in days if (requirement.id, day) in day_used
        ]
        model.add(sum(used_variables) >= requirement.minimum_distinct_days)
        constraints += 1

    raw_terms: dict[str, list[cp_model.LinearExpr]] = defaultdict(list)
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

    occupied_indicator: dict[tuple[str, int, int], cp_model.IntVar] = {}
    for teacher in request.teachers:
        total_periods = sum(
            requirement.weekly_occurrences * requirement.duration_periods
            for requirement in request.requirements
            if requirement.teacher_id == teacher.id
        )
        for day in days:
            daily_indicators: list[cp_model.IntVar] = []
            for period in teaching_periods:
                candidates = occupancy.get(("teacher", teacher.id, day, period), [])
                if not candidates:
                    continue
                occupied = model.new_bool_var(f"occupied_{teacher.id}_{day}_{period}")
                model.add(occupied == sum(candidates))
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
                raw_terms["DAILY_WORKLOAD_BALANCE"].append(imbalance)

    for requirement in request.requirements:
        requirement_used = [
            day_used[(requirement.id, day)] for day in days if (requirement.id, day) in day_used
        ]
        if requirement_used:
            repeat_penalty = model.new_int_var(
                0,
                requirement.weekly_occurrences,
                f"repeat_{requirement.id}",
            )
            model.add(repeat_penalty == requirement.weekly_occurrences - sum(requirement_used))
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
    if weighted_terms:
        model.minimize(quality_expression)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = request.options.time_limit_seconds
    solver.parameters.random_seed = request.options.random_seed
    solver.parameters.num_search_workers = 1
    first_started = time.monotonic()
    status = solver.solve(model)
    first_runtime_ms = round((time.monotonic() - first_started) * 1000)
    if status not in (cp_model.FEASIBLE, cp_model.OPTIMAL):
        return _infeasible(request, started, len(variables), constraints)

    selected = {choice for choice, variable in variables.items() if solver.boolean_value(variable)}
    assignments = _assignments_from_choices(selected)
    validation_errors = validate_assignments(request, assignments)
    if validation_errors:
        return SolveResponse(
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
    if weighted_terms and round(solver.objective_value) != score.total:
        return SolveResponse(
            job_id=request.job_id,
            input_fingerprint=input_fingerprint(request),
            status="FAILED",
            runtime_ms=round((time.monotonic() - started) * 1000),
            alternatives=[],
            diagnostics=[
                {
                    "code": "PENALTY_BREAKDOWN_MISMATCH",
                    "objective": round(solver.objective_value),
                    "breakdownTotal": score.total,
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
            runtime_ms=first_runtime_ms,
            warnings=[],
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
                runtime_ms=alternative_runtime_ms,
                warnings=[],
            )
        )
        previous_selections.append(alternative_selected)

    warnings = []
    if len(alternatives) < request.options.alternative_count:
        warnings.append("Fewer distinct alternatives were available within the quality limit.")
    return SolveResponse(
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


def _infeasible(
    request: SolveRequest, started: float, variable_count: int, constraint_count: int
) -> SolveResponse:
    return SolveResponse(
        job_id=request.job_id,
        input_fingerprint=input_fingerprint(request),
        status="INFEASIBLE",
        runtime_ms=round((time.monotonic() - started) * 1000),
        alternatives=[],
        diagnostics=[],
        warnings=[],
        variable_count=variable_count,
        constraint_count=constraint_count,
    )
