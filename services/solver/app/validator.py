from collections import Counter

from app.models import Assignment, SolveRequest


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
                ("TEACHER", current_requirement.teacher_id),
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
            teacher_daily_periods[(current_requirement.teacher_id, day)] += 1
            class_daily_periods[(current_requirement.class_section_id, day)] += 1
            teacher_periods.setdefault((current_requirement.teacher_id, day), set()).add(period)
        days_by_requirement.setdefault(current_requirement.id, set()).add(assignment.day_index)
        daily_counts[(current_requirement.id, assignment.day_index)] += 1

    for requirement in request.requirements:
        if (
            not allow_incomplete
            and len(days_by_requirement.get(requirement.id, set()))
            < requirement.distinct_day_minimum
        ):
            errors.append(f"DISTINCT_DAYS:{requirement.id}")
        if any(
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
                if not requirement.is_main_subject:
                    errors.append(f"SUBJECT_DAILY_REPEAT:{class_section.name}:{subject.name}")
                    continue
                pair_periods = sorted(item.period_index for item in daily)
                crosses_break = bool(
                    request.week_configuration
                    and pair_periods[0] == request.week_configuration.break_after_session - 1
                )
                if (
                    not requirement.allow_double_session
                    or len(pair_periods) != 2
                    or pair_periods[1] != pair_periods[0] + 1
                    or crosses_break
                ):
                    errors.append(f"MAIN_DOUBLE_NOT_CONSECUTIVE:{requirement.id}")
    for teacher in request.teachers:
        if request.schema_version == 2:
            allocated = sum(
                requirement.occurrence_count
                for requirement in request.requirements
                if requirement.teacher_id == teacher.id
            )
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
                        and request.week_configuration
                        and previous == request.week_configuration.break_after_session - 1
                    )
                    run = (
                        run + 1
                        if previous is not None and period == previous + 1 and not crosses_break
                        else 1
                    )
                    if run > teacher.max_consecutive_lessons:
                        errors.append(f"TEACHER_MAX_CONSECUTIVE:{teacher.id}")
                    previous = period
    for class_section in request.class_sections:
        if class_section.max_lessons_per_day and any(
            count > class_section.max_lessons_per_day
            for (class_id, _day), count in class_daily_periods.items()
            if class_id == class_section.id
        ):
            errors.append(f"CLASS_MAX_LESSONS_PER_DAY:{class_section.id}")
    return sorted(set(errors))
