from collections import Counter, defaultdict
from dataclasses import dataclass

from app.models import Assignment, SolveRequest

SOFT_CONSTRAINT_CODES = (
    "TEACHER_AVAILABILITY",
    "FIRST_LAST_PERIOD",
    "TEACHER_GAP",
    "PART_TIME_COMPACTNESS",
    "TEACHER_CONSECUTIVE_PREFERENCE",
    "MAIN_DOUBLE_ADJACENCY",
    "SUBJECT_SPREAD",
    "REPEATED_SUBJECT_DAY",
    "LATE_HEAVY_SUBJECT",
    "MAIN_SUBJECT_LATE_SESSION",
    "DAILY_WORKLOAD_BALANCE",
    "FULL_TIME_DAILY_BALANCE",
)


@dataclass(frozen=True)
class Score:
    total: int
    breakdown: dict[str, int]
    raw: dict[str, int]


def _class_break_after_session(request: SolveRequest, class_section_id: str) -> int | None:
    class_section = next(item for item in request.class_sections if item.id == class_section_id)
    if class_section.recess_after_session is not None:
        return class_section.recess_after_session
    return request.week_configuration.break_after_session if request.week_configuration else None


def _crosses_break(
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


def score_assignments(request: SolveRequest, assignments: list[Assignment]) -> Score:
    weights = request.constraint_profile.weights
    requirements = {item.id: item for item in request.requirements}
    subjects = {item.id: item for item in request.subjects}
    teachers = {item.id: item for item in request.teachers}
    teaching_periods = sorted(
        period.index for period in request.calendar.periods if period.is_teaching
    )
    working_days = sorted(day.index for day in request.calendar.days if day.is_working)
    first_period = teaching_periods[0] if teaching_periods else -1
    last_period = teaching_periods[-1] if teaching_periods else -1
    period_rank = {period: rank for rank, period in enumerate(teaching_periods)}
    teaching_session_by_period = {
        period: session for session, period in enumerate(teaching_periods, start=1)
    }
    availability = {
        (rule.entity_type, rule.entity_id, rule.day_index, rule.period_index): rule.state
        for rule in request.availability
    }
    preferred_by_teacher: dict[str, set[tuple[int, int]]] = defaultdict(set)
    for rule in request.availability:
        if rule.entity_type == "TEACHER" and rule.state == "PREFERRED":
            preferred_by_teacher[rule.entity_id].add((rule.day_index, rule.period_index))

    raw: Counter[str] = Counter()
    occupied_by_teacher: dict[tuple[str, int], set[int]] = defaultdict(set)
    subject_days: dict[str, list[int]] = defaultdict(list)
    subject_periods_by_day: dict[tuple[str, int], list[int]] = defaultdict(list)

    for assignment in assignments:
        requirement = requirements[assignment.requirement_id]
        subject = subjects[requirement.subject_id]
        subject_days[requirement.id].append(assignment.day_index)
        subject_periods_by_day[(requirement.id, assignment.day_index)].append(
            assignment.period_index
        )
        for offset in range(assignment.duration_periods):
            period = assignment.period_index + offset
            occupied_by_teacher[(requirement.teacher_id, assignment.day_index)].add(period)
            state = availability.get(
                ("TEACHER", requirement.teacher_id, assignment.day_index, period)
            )
            if state == "DISLIKED":
                raw["TEACHER_AVAILABILITY"] += 1
            preferred = preferred_by_teacher.get(requirement.teacher_id)
            if preferred and (assignment.day_index, period) not in preferred:
                raw["TEACHER_AVAILABILITY"] += 1
            if period in (first_period, last_period):
                raw["FIRST_LAST_PERIOD"] += 1
            rank = period_rank.get(period, 0)
            if subject.preferred_time_band == "EARLY":
                raw["LATE_HEAVY_SUBJECT"] += rank
            elif subject.preferred_time_band == "LATE":
                raw["LATE_HEAVY_SUBJECT"] += len(teaching_periods) - rank - 1
            if request.schema_version == 2 and requirement.is_main_subject and rank >= 4:
                raw["MAIN_SUBJECT_LATE_SESSION"] += 1

    for (teacher_id, _day), periods in occupied_by_teacher.items():
        if not periods:
            continue
        ordered = sorted(periods)
        internal_gaps = sum(
            1
            for period in teaching_periods
            if ordered[0] < period < ordered[-1] and period not in periods
        )
        raw["TEACHER_GAP"] += internal_gaps
        if teachers[teacher_id].employment_type == "PART_TIME":
            raw["PART_TIME_COMPACTNESS"] += internal_gaps
        adjacent = sum(
            1 for left, right in zip(ordered, ordered[1:], strict=False) if right == left + 1
        )
        raw["TEACHER_CONSECUTIVE_PREFERENCE"] += len(ordered) - adjacent

    for selected_days in subject_days.values():
        repeats = len(selected_days) - len(set(selected_days))
        raw["SUBJECT_SPREAD"] += repeats
        raw["REPEATED_SUBJECT_DAY"] += repeats

    for (requirement_id, _day), daily_subject_periods in subject_periods_by_day.items():
        requirement = requirements[requirement_id]
        if (
            request.schema_version != 2
            or not requirement.is_main_subject
            or not requirement.allow_double_session
            or len(daily_subject_periods) < 2
        ):
            continue
        ordered = sorted(daily_subject_periods)
        subject_break_after_session = _class_break_after_session(
            request,
            requirement.class_section_id,
        )
        has_adjacent_pair = any(
            right == left + 1
            and not _crosses_break(
                left,
                right,
                subject_break_after_session,
                teaching_session_by_period,
            )
            for left, right in zip(ordered, ordered[1:], strict=False)
        )
        if not has_adjacent_pair:
            raw["MAIN_DOUBLE_ADJACENCY"] += 1

    for teacher in request.teachers:
        daily_counts = [
            len(occupied_by_teacher.get((teacher.id, day), set())) for day in working_days
        ]
        total = sum(daily_counts)
        balance_code = (
            "FULL_TIME_DAILY_BALANCE"
            if request.schema_version == 2 and teacher.employment_type == "FULL_TIME"
            else "DAILY_WORKLOAD_BALANCE"
        )
        if request.schema_version == 2 and teacher.employment_type != "FULL_TIME":
            continue
        raw[balance_code] += sum(abs(count * len(working_days) - total) for count in daily_counts)

    breakdown = {
        code: raw[code] * weights.get(code, 0)
        for code in SOFT_CONSTRAINT_CODES
        if weights.get(code, 0) > 0
    }
    return Score(total=sum(breakdown.values()), breakdown=breakdown, raw=dict(raw))
