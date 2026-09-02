from collections import Counter

from app.models import Assignment, SolveRequest


def _part_time_distribution_can_relax(request: SolveRequest, requirement_id: str) -> bool:
    if request.schema_version != 2:
        return False
    requirements = {item.id: item for item in request.requirements}
    teachers = {item.id: item for item in request.teachers}
    requirement = requirements[requirement_id]
    return teachers[requirement.teacher_id].employment_type == "PART_TIME"


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


def _class_break_after_session(request: SolveRequest, class_section_id: str) -> int | None:
    class_section = next(item for item in request.class_sections if item.id == class_section_id)
    if class_section.recess_after_session is not None:
        return class_section.recess_after_session
    return request.week_configuration.break_after_session if request.week_configuration else None


def _class_session_interval(
    request: SolveRequest,
    class_section_id: str,
    period: int,
    duration: int,
) -> tuple[int, int]:
    if request.schema_version != 2 or request.week_configuration is None:
        return (period, period + duration)
    break_after_session = _class_break_after_session(request, class_section_id)
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


def _intervals_overlap(left: tuple[int, int], right: tuple[int, int]) -> bool:
    return left[0] < right[1] and right[0] < left[1]


def validate_assignments(
    request: SolveRequest,
    assignments: list[Assignment],
    *,
    allow_incomplete: bool = False,
) -> list[str]:
    errors: list[str] = []
    requirements = {item.id: item for item in request.requirements}
    enabled = {(slot.day_index, slot.period_index) for slot in request.calendar.enabled_slots}
    teaching = {period.index for period in request.calendar.periods if period.is_teaching}
    teaching_periods = sorted(teaching)
    teaching_session_by_period = {
        period: session for session, period in enumerate(teaching_periods, start=1)
    }
    teaching_rank_by_period = {period: rank for rank, period in enumerate(teaching_periods)}
    unavailable = {
        (rule.entity_type, rule.entity_id, rule.day_index, rule.period_index)
        for rule in request.availability
        if rule.state == "UNAVAILABLE"
    }
    counts = Counter(item.requirement_id for item in assignments)
    occupied: set[tuple[str, str, int, int]] = set()
    days_by_requirement: dict[str, set[int]] = {}
    daily_counts: Counter[tuple[str, int]] = Counter()
    teacher_daily_periods: Counter[tuple[str, int]] = Counter()
    class_daily_periods: Counter[tuple[str, int]] = Counter()
    teacher_periods: dict[tuple[str, int], set[int]] = {}
    rooms = {room.id: room for room in request.rooms}
    group_positions: dict[str, dict[str, set[tuple[int, int]]]] = {}
    teacher_event_seen: set[tuple[str, int, int]] = set()
    teacher_events: dict[tuple[str, int], list[tuple[Assignment, str | None, tuple[int, int]]]] = {}

    for requirement in request.requirements:
        if not allow_incomplete and counts[requirement.id] != requirement.occurrence_count:
            errors.append(f"EXACT_DEMAND:{requirement.id}")

    for assignment in assignments:
        current_requirement = requirements.get(assignment.requirement_id)
        if current_requirement is None:
            errors.append(f"UNKNOWN_REQUIREMENT:{assignment.requirement_id}")
            continue
        if assignment.duration_periods != current_requirement.occurrence_duration:
            errors.append(f"INVALID_DURATION:{current_requirement.id}")
        break_after_session = (
            _class_break_after_session(request, current_requirement.class_section_id)
            if request.schema_version == 2
            else None
        )
        if (
            break_after_session is not None
            and assignment.period_index
            < break_after_session
            <= assignment.period_index + assignment.duration_periods - 1
        ):
            errors.append(f"BREAK_CROSSING:{current_requirement.id}")
        if (
            current_requirement.required_room_id
            and assignment.room_id != current_requirement.required_room_id
        ):
            errors.append(f"REQUIRED_ROOM:{current_requirement.id}")
        if current_requirement.required_room_type:
            room = rooms.get(assignment.room_id or "")
            if room is None or room.type != current_requirement.required_room_type:
                errors.append(f"REQUIRED_ROOM_TYPE:{current_requirement.id}")
        for offset in range(assignment.duration_periods):
            day = assignment.day_index
            period = assignment.period_index + offset
            if (day, period) not in enabled or period not in teaching:
                errors.append(f"INVALID_SLOT:{current_requirement.id}")
            for kind, entity_id in (
                (
                    "TEACHER",
                    None,
                ),
                ("CLASS_SECTION", current_requirement.class_section_id),
                ("ROOM", assignment.room_id),
            ):
                if entity_id is None:
                    continue
                if (kind, entity_id, day, period) in unavailable:
                    errors.append(f"UNAVAILABLE:{kind}:{entity_id}")
                key = (kind, entity_id, day, period)
                if key in occupied:
                    errors.append(f"COLLISION:{kind}:{entity_id}")
                occupied.add(key)
            teacher_event_key = (
                current_requirement.shared_teaching_group_id or current_requirement.teacher_id,
                day,
                period,
            )
            if teacher_event_key not in teacher_event_seen:
                teacher_event_seen.add(teacher_event_key)
                teacher_daily_periods[(current_requirement.teacher_id, day)] += 1
                teacher_periods.setdefault((current_requirement.teacher_id, day), set()).add(period)
            class_daily_periods[(current_requirement.class_section_id, day)] += 1
        teacher_events.setdefault(
            (current_requirement.teacher_id, assignment.day_index), []
        ).append(
            (
                assignment,
                current_requirement.shared_teaching_group_id,
                _class_session_interval(
                    request,
                    current_requirement.class_section_id,
                    assignment.period_index,
                    assignment.duration_periods,
                ),
            )
        )
        days_by_requirement.setdefault(current_requirement.id, set()).add(assignment.day_index)
        daily_counts[(current_requirement.id, assignment.day_index)] += 1
        if current_requirement.shared_teaching_group_id:
            group_positions.setdefault(current_requirement.shared_teaching_group_id, {}).setdefault(
                current_requirement.id, set()
            ).add((assignment.day_index, assignment.period_index))

    for group_id, requirement_positions in group_positions.items():
        positions = list(requirement_positions.values())
        if positions and any(item != positions[0] for item in positions[1:]):
            errors.append(f"SHARED_GROUP_NOT_SYNCHRONIZED:{group_id}")
        synchronized_positions = positions[0] if positions else set()
        for _day_index, period_index in synchronized_positions:
            intervals = {
                _class_session_interval(
                    request,
                    requirements[requirement_id].class_section_id,
                    period_index,
                    requirements[requirement_id].occurrence_duration,
                )
                for requirement_id in requirement_positions
            }
            if len(intervals) > 1:
                errors.append(f"SHARED_GROUP_TIME_MISMATCH:{group_id}")

    for (teacher_id, _day), events in teacher_events.items():
        for index, left in enumerate(events):
            for right in events[index + 1 :]:
                left_assignment, left_group, left_interval = left
                right_assignment, right_group, right_interval = right
                same_shared_event = (
                    left_group is not None
                    and left_group == right_group
                    and left_assignment.period_index == right_assignment.period_index
                    and left_interval == right_interval
                )
                if not same_shared_event and _intervals_overlap(left_interval, right_interval):
                    errors.append(f"COLLISION:TEACHER_TIME:{teacher_id}")

    for requirement in request.requirements:
        if (
            not allow_incomplete
            and not _part_time_distribution_can_relax(request, requirement.id)
            and len(days_by_requirement.get(requirement.id, set()))
            < requirement.distinct_day_minimum
        ):
            errors.append(f"DISTINCT_DAYS:{requirement.id}")
        if not _part_time_distribution_can_relax(request, requirement.id) and any(
            count > requirement.daily_occurrence_limit
            for (requirement_id, _day), count in daily_counts.items()
            if requirement_id == requirement.id
        ):
            errors.append(f"MAX_OCCURRENCES_PER_DAY:{requirement.id}")
        if request.schema_version == 2:
            assignments_by_day: dict[int, list[Assignment]] = {}
            for assignment in assignments:
                if assignment.requirement_id == requirement.id:
                    assignments_by_day.setdefault(assignment.day_index, []).append(assignment)
            class_section = next(
                item for item in request.class_sections if item.id == requirement.class_section_id
            )
            subject = next(item for item in request.subjects if item.id == requirement.subject_id)
            for daily in assignments_by_day.values():
                if len(daily) < 2:
                    continue
                if _part_time_distribution_can_relax(request, requirement.id):
                    continue
                if not requirement.is_main_subject:
                    errors.append(f"SUBJECT_DAILY_REPEAT:{class_section.name}:{subject.name}")
                    continue
                if not requirement.allow_double_session:
                    errors.append(f"MAIN_DOUBLE_DISABLED:{requirement.id}")
    for teacher in request.teachers:
        if request.schema_version == 2:
            counted_groups: set[str] = set()
            allocated = 0
            for requirement in request.requirements:
                if requirement.teacher_id != teacher.id:
                    continue
                if requirement.shared_teaching_group_id:
                    if requirement.shared_teaching_group_id in counted_groups:
                        continue
                    counted_groups.add(requirement.shared_teaching_group_id)
                allocated += requirement.occurrence_count
            if allocated != teacher.weekly_teaching_sessions:
                errors.append(f"TEACHER_WORKLOAD_MISMATCH:{teacher.id}")
        if teacher.max_lessons_per_day and any(
            count > teacher.max_lessons_per_day
            for (teacher_id, _day), count in teacher_daily_periods.items()
            if teacher_id == teacher.id
        ):
            errors.append(f"TEACHER_MAX_LESSONS_PER_DAY:{teacher.id}")
        if teacher.max_consecutive_lessons:
            for (teacher_id, _day), periods in teacher_periods.items():
                if teacher_id != teacher.id:
                    continue
                run = 0
                previous: int | None = None
                for period in sorted(periods):
                    crosses_break = bool(
                        request.schema_version == 2
                        and previous is not None
                        and request.week_configuration
                        and _crosses_break(
                            previous,
                            period,
                            request.week_configuration.break_after_session,
                            teaching_session_by_period,
                        )
                    )
                    run = (
                        run + 1
                        if previous is not None and period == previous + 1 and not crosses_break
                        else 1
                    )
                    if run > teacher.max_consecutive_lessons:
                        errors.append(f"TEACHER_MAX_CONSECUTIVE:{teacher.id}")
                    previous = period
        if teacher.employment_type == "FULL_TIME":
            for (teacher_id, _day), periods in teacher_periods.items():
                if teacher_id != teacher.id:
                    continue
                ordered = sorted(
                    teaching_rank_by_period[period]
                    for period in periods
                    if period in teaching_rank_by_period
                )
                for left_rank, right_rank in zip(ordered, ordered[1:], strict=False):
                    if right_rank - left_rank - 1 > 2:
                        errors.append(f"FULL_TIME_TEACHER_INTERNAL_GAP:{teacher.id}")
    for class_section in request.class_sections:
        if class_section.max_lessons_per_day and any(
            count > class_section.max_lessons_per_day
            for (class_id, _day), count in class_daily_periods.items()
            if class_id == class_section.id
        ):
            errors.append(f"CLASS_MAX_LESSONS_PER_DAY:{class_section.id}")
    return sorted(set(errors))
