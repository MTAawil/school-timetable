import hashlib
import json
from collections import Counter
from typing import Any

from app.models import Assignment, SolveRequest
from app.scoring import score_assignments
from app.solver import _resource_packing_diagnostic, input_fingerprint, solve
from app.validator import validate_assignments


def supervisor_request(
    *,
    weekly_sessions: int = 6,
    is_main_subject: bool = True,
    allow_double_session: bool = True,
    sessions_per_day: int = 4,
    class_id: str = "G7-A",
) -> SolveRequest:
    days = [
        {"id": f"d{day}", "index": day, "name": f"Day {day}", "isWorking": True} for day in range(5)
    ]
    periods = [
        {"id": f"p{period}", "index": period, "name": f"P{period}", "isTeaching": True}
        for period in range(sessions_per_day)
    ]
    slots = [
        {
            "id": f"s{day}-{period}",
            "dayIndex": day,
            "periodIndex": period,
        }
        for day in range(5)
        for period in range(sessions_per_day)
    ]
    payload: dict[str, Any] = {
        "schemaVersion": 2,
        "jobId": "supervisor-rules",
        "school": {"id": "school", "name": "School", "timezone": "Asia/Beirut"},
        "term": {"id": "term", "name": "Term", "roomsEnabled": False},
        "weekConfiguration": {
            "workingDayCount": 5,
            "sessionsPerDay": sessions_per_day,
            "sessionDurationMinutes": 45,
            "firstSessionStartMinutes": 450,
            "breakAfterSession": 2,
            "breakDurationMinutes": 20,
        },
        "calendar": {"days": days, "periods": periods, "enabledSlots": slots},
        "teachers": [
            {
                "id": "teacher",
                "name": "Teacher",
                "employmentType": "FULL_TIME",
                "weeklyTeachingSessions": weekly_sessions,
                "maxLessonsPerDay": sessions_per_day,
                "maxConsecutiveLessons": sessions_per_day,
            }
        ],
        "subjects": [{"id": "MATH", "name": "MATH"}],
        "classSections": [
            {
                "id": class_id,
                "name": class_id,
                "shortCode": class_id,
                "maxLessonsPerDay": sessions_per_day,
            }
        ],
        "rooms": [],
        "requirements": [
            {
                "id": f"{class_id}:MATH",
                "classSectionId": class_id,
                "subjectId": "MATH",
                "teacherId": "teacher",
                "weeklySessions": weekly_sessions,
                "isMainSubject": is_main_subject,
                "allowDoubleSession": allow_double_session,
                "fixedSlots": [],
                "forbiddenSlots": [],
            }
        ],
        "availability": [],
        "lockedAssignments": [],
        "existingAssignments": [],
        "constraintProfile": {
            "id": None,
            "weights": {"FULL_TIME_DAILY_BALANCE": 1, "MAIN_DOUBLE_ADJACENCY": 12},
        },
        "options": {
            "alternativeCount": 1,
            "timeLimitSeconds": 10,
            "randomSeed": 12345,
            "maxQualityDegradationPercent": 20,
            "roomsEnabled": False,
            "useExistingScheduleHint": False,
        },
    }
    return SolveRequest.model_validate(payload)


def social_studies_request(*, class_id: str = "G7-A") -> SolveRequest:
    payload = supervisor_request(
        weekly_sessions=1,
        is_main_subject=False,
        allow_double_session=False,
        sessions_per_day=4,
        class_id=class_id,
    ).model_dump(by_alias=True)
    subjects = [
        {"id": "subject-1", "name": "تاريخ"},
        {"id": "subject-2", "name": "جغرافيا"},
        {"id": "subject-3", "name": "تربية"},
        {"id": "subject-4", "name": "دين"},
    ]
    payload["subjects"] = subjects
    payload["teachers"] = [
        {
            "id": f"teacher-{subject['id']}",
            "name": f"Teacher {subject['name']}",
            "employmentType": "FULL_TIME",
            "weeklyTeachingSessions": 1,
            "maxLessonsPerDay": 4,
            "maxConsecutiveLessons": 4,
        }
        for subject in subjects
    ]
    payload["requirements"] = [
        {
            "id": f"{class_id}:{subject['id']}",
            "classSectionId": class_id,
            "subjectId": subject["id"],
            "teacherId": f"teacher-{subject['id']}",
            "weeklySessions": 1,
            "isMainSubject": False,
            "allowDoubleSession": False,
            "fixedSlots": [],
            "forbiddenSlots": [],
        }
        for subject in subjects
    ]
    return SolveRequest.model_validate(payload)


def social_studies_request_with_subjects(
    *,
    class_id: str,
    subjects: list[dict[str, str]],
) -> SolveRequest:
    payload = supervisor_request(
        weekly_sessions=1,
        is_main_subject=False,
        allow_double_session=False,
        sessions_per_day=6,
        class_id=class_id,
    ).model_dump(by_alias=True)
    payload["subjects"] = subjects
    payload["teachers"] = [
        {
            "id": f"teacher-{subject['id']}",
            "name": f"Teacher {subject['name']}",
            "employmentType": "FULL_TIME",
            "weeklyTeachingSessions": 1,
            "maxLessonsPerDay": 6,
            "maxConsecutiveLessons": 6,
        }
        for subject in subjects
    ]
    payload["requirements"] = [
        {
            "id": f"{class_id}:{subject['id']}",
            "classSectionId": class_id,
            "subjectId": subject["id"],
            "teacherId": f"teacher-{subject['id']}",
            "weeklySessions": 1,
            "isMainSubject": False,
            "allowDoubleSession": False,
            "fixedSlots": [],
            "forbiddenSlots": [],
        }
        for subject in subjects
    ]
    return SolveRequest.model_validate(payload)


def test_main_subject_late_session_penalty_starts_after_fourth_session() -> None:
    base_request = supervisor_request(weekly_sessions=1, sessions_per_day=6)
    request = base_request.model_copy(
        update={
            "constraint_profile": base_request.constraint_profile.model_copy(
                update={"weights": {"MAIN_SUBJECT_LATE_SESSION": 8}}
            )
        }
    )

    fourth_session = [
        Assignment(
            requirement_id="G7-A:MATH",
            day_index=0,
            period_index=3,
            duration_periods=1,
        )
    ]
    fifth_session = [
        Assignment(
            requirement_id="G7-A:MATH",
            day_index=0,
            period_index=4,
            duration_periods=1,
        )
    ]

    assert score_assignments(request, fourth_session).breakdown["MAIN_SUBJECT_LATE_SESSION"] == 0
    assert score_assignments(request, fifth_session).breakdown["MAIN_SUBJECT_LATE_SESSION"] == 8


def test_solver_contract_accepts_fifteen_minute_time_limit() -> None:
    payload = supervisor_request().model_dump(by_alias=True)
    payload["options"]["timeLimitSeconds"] = 900

    request = SolveRequest.model_validate(payload)

    assert request.options.time_limit_seconds == 900


def test_solver_prefers_main_subject_before_fifth_session_when_possible() -> None:
    base_request = supervisor_request(weekly_sessions=1, sessions_per_day=6)
    request = base_request.model_copy(
        update={
            "constraint_profile": base_request.constraint_profile.model_copy(
                update={"weights": {"MAIN_SUBJECT_LATE_SESSION": 8}}
            )
        }
    )

    response = solve(request)

    assert response.status in {"FEASIBLE", "OPTIMAL"}
    assert response.alternatives[0].assignments[0].period_index < 4


def test_infeasible_teacher_packing_diagnostic_names_resource() -> None:
    payload = supervisor_request(
        weekly_sessions=2,
        is_main_subject=False,
        allow_double_session=False,
        sessions_per_day=2,
    ).model_dump(by_alias=True)
    payload["classSections"].append(
        {
            "id": "G8-A",
            "name": "G8-A",
            "shortCode": "G8-A",
            "maxLessonsPerDay": 2,
        }
    )
    payload["requirements"].append(
        {
            "id": "G8-A:MATH",
            "classSectionId": "G8-A",
            "subjectId": "MATH",
            "teacherId": "teacher",
            "weeklySessions": 1,
            "isMainSubject": False,
            "allowDoubleSession": False,
            "fixedSlots": [],
            "forbiddenSlots": [],
        }
    )
    payload["teachers"][0]["weeklyTeachingSessions"] = 3
    payload["teachers"][0]["employmentType"] = "PART_TIME"
    payload["availability"] = [
        {
            "entityType": "TEACHER",
            "entityId": "teacher",
            "dayIndex": day,
            "periodIndex": period,
            "state": "UNAVAILABLE",
        }
        for day in range(5)
        for period in range(2)
        if (day, period) not in {(0, 0), (1, 0)}
    ]

    response = solve(SolveRequest.model_validate(payload))

    assert response.status == "INFEASIBLE"
    assert response.diagnostics[0]["code"] == "TEACHER_PACKING_CONFLICT"
    assert response.diagnostics[0]["resourceName"] == "Teacher"
    assert response.diagnostics[0]["required"] == 3


def test_teacher_packing_diagnostic_ignores_cross_day_clock_matches() -> None:
    payload = supervisor_request(
        weekly_sessions=1,
        is_main_subject=False,
        allow_double_session=False,
        sessions_per_day=2,
    ).model_dump(by_alias=True)
    payload["teachers"][0]["employmentType"] = "PART_TIME"
    payload["teachers"][0]["weeklyTeachingSessions"] = 2
    payload["classSections"].append(
        {
            "id": "G8-A",
            "name": "G8-A",
            "shortCode": "G8-A",
            "maxLessonsPerDay": 2,
        }
    )
    payload["requirements"].append(
        {
            "id": "G8-A:MATH",
            "classSectionId": "G8-A",
            "subjectId": "MATH",
            "teacherId": "teacher",
            "weeklySessions": 1,
            "isMainSubject": False,
            "allowDoubleSession": False,
            "fixedSlots": [],
            "forbiddenSlots": [],
        }
    )
    payload["requirements"][0]["fixedSlots"] = [{"dayIndex": 0, "periodIndex": 0}]
    payload["requirements"][1]["fixedSlots"] = [{"dayIndex": 1, "periodIndex": 0}]
    request = SolveRequest.model_validate(payload)

    diagnostic = _resource_packing_diagnostic(
        request,
        resource_type="TEACHER",
        resource_id="teacher",
        requirements=request.requirements,
    )

    assert diagnostic is None


def test_teacher_packing_diagnostic_includes_overlap_examples() -> None:
    payload = supervisor_request(
        weekly_sessions=1,
        is_main_subject=False,
        allow_double_session=False,
        sessions_per_day=6,
    ).model_dump(by_alias=True)
    payload["teachers"][0]["employmentType"] = "PART_TIME"
    payload["teachers"][0]["weeklyTeachingSessions"] = 2
    payload["classSections"][0]["recessAfterSession"] = 3
    payload["classSections"].append(
        {
            "id": "G10-A",
            "name": "G10-A",
            "shortCode": "G10-A",
            "maxLessonsPerDay": 6,
            "recessAfterSession": 4,
        }
    )
    payload["requirements"].append(
        {
            "id": "G10-A:MATH",
            "classSectionId": "G10-A",
            "subjectId": "MATH",
            "teacherId": "teacher",
            "weeklySessions": 1,
            "isMainSubject": False,
            "allowDoubleSession": False,
            "fixedSlots": [{"dayIndex": 0, "periodIndex": 3}],
            "forbiddenSlots": [],
        }
    )
    payload["requirements"][0]["fixedSlots"] = [{"dayIndex": 0, "periodIndex": 3}]
    request = SolveRequest.model_validate(payload)

    diagnostic = _resource_packing_diagnostic(
        request,
        resource_type="TEACHER",
        resource_id="teacher",
        requirements=request.requirements,
    )

    assert diagnostic is not None
    assert diagnostic["code"] == "TEACHER_PACKING_CONFLICT"
    assert diagnostic["overlapExamples"] == [
        {
            "dayIndex": 0,
            "left": {
                "requirementId": "G7-A:MATH",
                "className": "G7-A",
                "subjectName": "MATH",
                "session": 4,
                "startsAtMinutes": 605,
                "endsAtMinutes": 650,
            },
            "right": {
                "requirementId": "G10-A:MATH",
                "className": "G10-A",
                "subjectName": "MATH",
                "session": 4,
                "startsAtMinutes": 585,
                "endsAtMinutes": 630,
            },
        }
    ]


def test_class_packing_diagnostic_includes_slot_pressure() -> None:
    payload = supervisor_request(
        weekly_sessions=5,
        is_main_subject=False,
        allow_double_session=False,
        sessions_per_day=1,
    ).model_dump(by_alias=True)
    payload["teachers"].append(
        {
            "id": "limited",
            "name": "Limited",
            "employmentType": "PART_TIME",
            "weeklyTeachingSessions": 1,
            "maxLessonsPerDay": 1,
            "maxConsecutiveLessons": 1,
        }
    )
    payload["subjects"].append({"id": "SCI", "name": "SCI"})
    payload["requirements"].append(
        {
            "id": "G7-A:SCI",
            "classSectionId": "G7-A",
            "subjectId": "SCI",
            "teacherId": "limited",
            "weeklySessions": 1,
            "isMainSubject": False,
            "allowDoubleSession": False,
            "fixedSlots": [],
            "forbiddenSlots": [],
        }
    )
    payload["availability"] = [
        {
            "entityType": "TEACHER",
            "entityId": "limited",
            "dayIndex": day,
            "periodIndex": 0,
            "state": "UNAVAILABLE",
        }
        for day in range(1, 5)
    ]
    request = SolveRequest.model_validate(payload)

    diagnostic = _resource_packing_diagnostic(
        request,
        resource_type="CLASS_SECTION",
        resource_id="G7-A",
        requirements=request.requirements,
    )

    assert diagnostic is not None
    assert diagnostic["code"] == "CLASS_PACKING_CONFLICT"
    assert diagnostic["slotPressure"] == {
        "classCapacity": 5,
        "required": 6,
        "tightestRequirements": [
            {
                "requirementId": "G7-A:SCI",
                "subjectName": "SCI",
                "teacherName": "Limited",
                "teacherEmploymentType": "PART_TIME",
                "weeklySessions": 1,
                "compatibleStarts": 1,
                "availableSlots": [{"dayIndex": 0, "dayName": "Day 0", "session": 1}],
                "availableSlotCount": 1,
                "shownSlotCount": 1,
            },
            {
                "requirementId": "G7-A:MATH",
                "subjectName": "MATH",
                "teacherName": "Teacher",
                "teacherEmploymentType": "FULL_TIME",
                "weeklySessions": 5,
                "compatibleStarts": 5,
                "availableSlots": [
                    {"dayIndex": 0, "dayName": "Day 0", "session": 1},
                    {"dayIndex": 1, "dayName": "Day 1", "session": 1},
                    {"dayIndex": 2, "dayName": "Day 2", "session": 1},
                    {"dayIndex": 3, "dayName": "Day 3", "session": 1},
                    {"dayIndex": 4, "dayName": "Day 4", "session": 1},
                ],
                "availableSlotCount": 5,
                "shownSlotCount": 5,
            },
        ],
    }


def test_optional_main_double_is_adjacent_and_does_not_cross_break() -> None:
    request = supervisor_request()

    response = solve(request)

    assert response.status in {"FEASIBLE", "OPTIMAL"}
    result = response.alternatives[0].assignments
    assert len(result) == 6
    assert validate_assignments(request, result) == []
    daily = {
        day: sorted(assignment.period_index for assignment in result if assignment.day_index == day)
        for day in range(5)
    }
    pairs = [periods for periods in daily.values() if len(periods) == 2]
    assert pairs
    assert all(periods[1] == periods[0] + 1 for periods in pairs)
    assert all(periods != [1, 2] for periods in pairs)


def test_allowed_main_double_can_be_distributed_when_needed() -> None:
    request = supervisor_request(weekly_sessions=2, class_id="G10-A")
    candidate = [
        Assignment(
            requirement_id="G10-A:MATH",
            day_index=0,
            period_index=0,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G10-A:MATH",
            day_index=0,
            period_index=3,
            duration_periods=1,
        ),
    ]

    assert validate_assignments(request, candidate) == []
    scored = score_assignments(
        request.model_copy(
            update={
                "constraint_profile": request.constraint_profile.model_copy(
                    update={"weights": {"MAIN_DOUBLE_ADJACENCY": 12}}
                )
            }
        ),
        candidate,
    )

    assert scored.breakdown["MAIN_DOUBLE_ADJACENCY"] == 12


def test_validator_allows_missing_weekly_main_double_for_grades_one_to_nine() -> None:
    request = supervisor_request(weekly_sessions=2)
    candidate = [
        Assignment(
            requirement_id="G7-A:MATH",
            day_index=0,
            period_index=0,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G7-A:MATH",
            day_index=1,
            period_index=0,
            duration_periods=1,
        ),
    ]

    assert validate_assignments(request, candidate) == []


def test_missing_weekly_main_double_for_grades_one_to_nine_has_high_penalty() -> None:
    request = supervisor_request(weekly_sessions=2)
    candidate = [
        Assignment(
            requirement_id="G7-A:MATH",
            day_index=0,
            period_index=0,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G7-A:MATH",
            day_index=1,
            period_index=0,
            duration_periods=1,
        ),
    ]

    scored = score_assignments(request, candidate)

    assert scored.breakdown["MAIN_DOUBLE_ADJACENCY"] == 120


def test_solver_prefers_weekly_main_double_for_grades_one_to_nine() -> None:
    request = supervisor_request(weekly_sessions=5, sessions_per_day=6)

    response = solve(request)

    assert response.status in {"FEASIBLE", "OPTIMAL"}
    assignments = sorted(
        response.alternatives[0].assignments,
        key=lambda assignment: (assignment.day_index, assignment.period_index),
    )
    assert any(
        left.day_index == right.day_index and right.period_index == left.period_index + 1
        for left, right in zip(assignments, assignments[1:], strict=False)
    )
    assert validate_assignments(request, response.alternatives[0].assignments) == []


def test_main_double_adjacency_counts_extra_non_adjacent_session() -> None:
    request = supervisor_request(weekly_sessions=3, class_id="G10-A")
    candidate = [
        Assignment(
            requirement_id="G10-A:MATH",
            day_index=0,
            period_index=0,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G10-A:MATH",
            day_index=0,
            period_index=1,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G10-A:MATH",
            day_index=0,
            period_index=3,
            duration_periods=1,
        ),
    ]

    scored = score_assignments(request, candidate)

    assert scored.breakdown["MAIN_DOUBLE_ADJACENCY"] == 12


def test_validator_rejects_repeated_non_main_subject() -> None:
    request = supervisor_request(
        weekly_sessions=2,
        is_main_subject=False,
        allow_double_session=False,
    )
    candidate = [
        Assignment(
            requirement_id="G7-A:MATH",
            day_index=0,
            period_index=0,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G7-A:MATH",
            day_index=0,
            period_index=1,
            duration_periods=1,
        ),
    ]

    assert "SUBJECT_DAILY_REPEAT:G7-A:MATH" in validate_assignments(request, candidate)


def test_validator_rejects_more_than_two_social_studies_subjects_per_class_day() -> None:
    request = social_studies_request()
    candidate = [
        Assignment(
            requirement_id="G7-A:subject-1",
            day_index=0,
            period_index=0,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G7-A:subject-2",
            day_index=0,
            period_index=1,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G7-A:subject-3",
            day_index=0,
            period_index=2,
            duration_periods=1,
        ),
    ]

    assert "SOCIAL_STUDIES_DAILY_LIMIT:G7-A:0" in validate_assignments(request, candidate)


def test_validator_allows_two_social_studies_subjects_per_class_day() -> None:
    request = social_studies_request()
    candidate = [
        Assignment(
            requirement_id="G7-A:subject-1",
            day_index=0,
            period_index=0,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G7-A:subject-4",
            day_index=0,
            period_index=1,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G7-A:subject-2",
            day_index=1,
            period_index=0,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G7-A:subject-3",
            day_index=1,
            period_index=1,
            duration_periods=1,
        ),
    ]

    assert validate_assignments(request, candidate) == []


def test_social_studies_second_daily_subject_has_high_penalty() -> None:
    base_request = social_studies_request()
    request = base_request.model_copy(
        update={
            "constraint_profile": base_request.constraint_profile.model_copy(
                update={"weights": {"SOCIAL_STUDIES_DAILY_SPREAD": 200}}
            )
        }
    )
    candidate = [
        Assignment(
            requirement_id="G7-A:subject-1",
            day_index=0,
            period_index=0,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G7-A:subject-3",
            day_index=0,
            period_index=1,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G7-A:subject-2",
            day_index=1,
            period_index=0,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G7-A:subject-4",
            day_index=2,
            period_index=0,
            duration_periods=1,
        ),
    ]

    scored = score_assignments(request, candidate)

    assert validate_assignments(request, candidate) == []
    assert scored.breakdown["SOCIAL_STUDIES_DAILY_SPREAD"] == 200


def test_grade_ten_counts_expanded_social_studies_subjects_in_hard_limit() -> None:
    request = social_studies_request(class_id="G10-10A")
    payload = request.model_dump(by_alias=True)
    extra_subjects = [
        {"id": "subject-5", "name": "\u0627\u062c\u062a\u0645\u0627\u0639"},
        {"id": "subject-6", "name": "\u0627\u0642\u062a\u0635\u0627\u062f"},
        {"id": "subject-7", "name": "\u0641\u0644\u0633\u0641\u0629"},
    ]
    payload["subjects"].extend(extra_subjects)
    payload["teachers"].extend(
        {
            "id": f"teacher-{subject['id']}",
            "name": f"Teacher {subject['name']}",
            "employmentType": "FULL_TIME",
            "weeklyTeachingSessions": 1,
            "maxLessonsPerDay": 4,
            "maxConsecutiveLessons": 4,
        }
        for subject in extra_subjects
    )
    payload["requirements"].extend(
        {
            "id": f"G10-10A:{subject['id']}",
            "classSectionId": "G10-10A",
            "subjectId": subject["id"],
            "teacherId": f"teacher-{subject['id']}",
            "weeklySessions": 1,
            "isMainSubject": False,
            "allowDoubleSession": False,
            "fixedSlots": [],
            "forbiddenSlots": [],
        }
        for subject in extra_subjects
    )
    request = SolveRequest.model_validate(payload)
    candidate = [
        Assignment(
            requirement_id="G10-10A:subject-1",
            day_index=0,
            period_index=0,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G10-10A:subject-5",
            day_index=0,
            period_index=1,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G10-10A:subject-6",
            day_index=0,
            period_index=2,
            duration_periods=1,
        ),
    ]

    assert "SOCIAL_STUDIES_DAILY_LIMIT:G10-10A:0" in validate_assignments(
        request,
        candidate,
    )


def test_non_upper_secondary_does_not_count_expanded_social_studies_subjects() -> None:
    request = social_studies_request()
    payload = request.model_dump(by_alias=True)
    extra_subjects = [
        {"id": "subject-5", "name": "\u0627\u062c\u062a\u0645\u0627\u0639"},
        {"id": "subject-6", "name": "\u0627\u0642\u062a\u0635\u0627\u062f"},
    ]
    payload["subjects"].extend(extra_subjects)
    payload["teachers"].extend(
        {
            "id": f"teacher-{subject['id']}",
            "name": f"Teacher {subject['name']}",
            "employmentType": "FULL_TIME",
            "weeklyTeachingSessions": 1,
            "maxLessonsPerDay": 4,
            "maxConsecutiveLessons": 4,
        }
        for subject in extra_subjects
    )
    payload["requirements"].extend(
        {
            "id": f"G7-A:{subject['id']}",
            "classSectionId": "G7-A",
            "subjectId": subject["id"],
            "teacherId": f"teacher-{subject['id']}",
            "weeklySessions": 1,
            "isMainSubject": False,
            "allowDoubleSession": False,
            "fixedSlots": [],
            "forbiddenSlots": [],
        }
        for subject in extra_subjects
    )
    request = SolveRequest.model_validate(payload)
    candidate = [
        Assignment(
            requirement_id="G7-A:subject-1",
            day_index=0,
            period_index=0,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G7-A:subject-5",
            day_index=0,
            period_index=1,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G7-A:subject-6",
            day_index=0,
            period_index=2,
            duration_periods=1,
        ),
    ]

    errors = validate_assignments(request, candidate)

    assert not any(error.startswith("SOCIAL_STUDIES_DAILY_LIMIT") for error in errors)


def test_grade_ten_skips_social_studies_daily_spread_penalty() -> None:
    base_request = social_studies_request(class_id="G10-10A")
    request = base_request.model_copy(
        update={
            "constraint_profile": base_request.constraint_profile.model_copy(
                update={"weights": {"SOCIAL_STUDIES_DAILY_SPREAD": 200}}
            )
        }
    )
    candidate = [
        Assignment(
            requirement_id="G10-10A:subject-1",
            day_index=0,
            period_index=0,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G10-10A:subject-3",
            day_index=0,
            period_index=1,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G10-10A:subject-2",
            day_index=1,
            period_index=0,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G10-10A:subject-4",
            day_index=2,
            period_index=0,
            duration_periods=1,
        ),
    ]

    scored = score_assignments(request, candidate)

    assert validate_assignments(request, candidate) == []
    assert scored.breakdown["SOCIAL_STUDIES_DAILY_SPREAD"] == 0


def test_es_se_social_studies_uses_four_hard_limit_and_three_soft_target() -> None:
    subjects = [
        {"id": "subject-history", "name": "\u062a\u0627\u0631\u064a\u062e"},
        {"id": "subject-geography", "name": "\u062c\u063a\u0631\u0627\u0641\u064a\u0627"},
        {"id": "subject-civics", "name": "\u062a\u0631\u0628\u064a\u0629"},
        {"id": "subject-sociology", "name": "\u0627\u062c\u062a\u0645\u0627\u0639"},
        {"id": "subject-economics", "name": "\u0627\u0642\u062a\u0635\u0627\u062f"},
        {"id": "subject-religion", "name": "\u062f\u064a\u0646"},
    ]
    base_request = social_studies_request_with_subjects(
        class_id="ES",
        subjects=subjects,
    )
    request = base_request.model_copy(
        update={
            "constraint_profile": base_request.constraint_profile.model_copy(
                update={"weights": {"SOCIAL_STUDIES_DAILY_SPREAD": 200}}
            )
        }
    )
    four_counted_subjects = subjects[:4]
    four_counted = [
        Assignment(
            requirement_id=f"ES:{subject['id']}",
            day_index=0,
            period_index=period,
            duration_periods=1,
        )
        for period, subject in enumerate(four_counted_subjects)
    ]
    five_counted = [
        *four_counted,
        Assignment(
            requirement_id="ES:subject-economics",
            day_index=0,
            period_index=4,
            duration_periods=1,
        ),
    ]
    four_counted_plus_religion = [
        *four_counted,
        Assignment(
            requirement_id="ES:subject-religion",
            day_index=0,
            period_index=4,
            duration_periods=1,
        ),
    ]

    assert not any(
        error.startswith("SOCIAL_STUDIES_DAILY_LIMIT")
        for error in validate_assignments(request, four_counted_plus_religion)
    )
    assert "SOCIAL_STUDIES_DAILY_LIMIT:ES:0" in validate_assignments(
        request,
        five_counted,
    )
    assert score_assignments(request, four_counted).breakdown["SOCIAL_STUDIES_DAILY_SPREAD"] == 200


def test_ls_sv_social_studies_counts_philosophy_with_two_hard_limit() -> None:
    subjects = [
        {"id": "subject-history", "name": "\u062a\u0627\u0631\u064a\u062e"},
        {"id": "subject-philosophy", "name": "\u0641\u0644\u0633\u0641\u0629"},
        {"id": "subject-civics", "name": "\u062a\u0631\u0628\u064a\u0629"},
        {"id": "subject-religion", "name": "\u062f\u064a\u0646"},
    ]
    request = social_studies_request_with_subjects(
        class_id="SV",
        subjects=subjects,
    )
    three_counted = [
        Assignment(
            requirement_id=f"SV:{subject['id']}",
            day_index=0,
            period_index=period,
            duration_periods=1,
        )
        for period, subject in enumerate(subjects[:3])
    ]
    two_counted_plus_religion = [
        *three_counted[:2],
        Assignment(
            requirement_id="SV:subject-religion",
            day_index=0,
            period_index=2,
            duration_periods=1,
        ),
    ]

    assert "SOCIAL_STUDIES_DAILY_LIMIT:SV:0" in validate_assignments(
        request,
        three_counted,
    )
    assert not any(
        error.startswith("SOCIAL_STUDIES_DAILY_LIMIT")
        for error in validate_assignments(request, two_counted_plus_religion)
    )


def test_solver_avoids_second_social_studies_subject_per_day_when_possible() -> None:
    base_request = social_studies_request()
    request = base_request.model_copy(
        update={
            "constraint_profile": base_request.constraint_profile.model_copy(
                update={"weights": {"SOCIAL_STUDIES_DAILY_SPREAD": 200}}
            )
        }
    )

    response = solve(request)

    assert response.status in {"FEASIBLE", "OPTIMAL"}
    daily_counts: Counter[tuple[str, int]] = Counter()
    requirements = {item.id: item for item in request.requirements}
    for assignment in response.alternatives[0].assignments:
        requirement = requirements[assignment.requirement_id]
        daily_counts[(requirement.class_section_id, assignment.day_index)] += 1
    assert max(daily_counts.values()) == 1
    assert response.alternatives[0].penalty_breakdown["SOCIAL_STUDIES_DAILY_SPREAD"] == 0


def test_solver_rejects_fixed_social_studies_daily_overload() -> None:
    request = social_studies_request()
    payload = request.model_dump(by_alias=True)
    for period, requirement in enumerate(payload["requirements"][:3]):
        requirement["fixedSlots"] = [{"dayIndex": 0, "periodIndex": period}]
    request = SolveRequest.model_validate(payload)

    response = solve(request)

    assert response.status == "INFEASIBLE"


def test_validator_allows_part_time_distribution_relaxation() -> None:
    payload = supervisor_request(
        weekly_sessions=2,
        is_main_subject=False,
        allow_double_session=False,
    ).model_dump(by_alias=True)
    payload["teachers"][0]["employmentType"] = "PART_TIME"
    request = SolveRequest.model_validate(payload)
    candidate = [
        Assignment(
            requirement_id="G7-A:MATH",
            day_index=0,
            period_index=0,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G7-A:MATH",
            day_index=0,
            period_index=1,
            duration_periods=1,
        ),
    ]

    assert validate_assignments(request, candidate) == []


def test_validator_rejects_same_day_triple_consecutive_subject_sessions() -> None:
    payload = supervisor_request(
        weekly_sessions=3,
        is_main_subject=False,
        allow_double_session=False,
        sessions_per_day=6,
    ).model_dump(by_alias=True)
    payload["teachers"][0]["employmentType"] = "PART_TIME"
    payload["teachers"][0]["weeklyTeachingSessions"] = 3
    request = SolveRequest.model_validate(payload)
    candidate = [
        Assignment(
            requirement_id="G7-A:MATH",
            day_index=0,
            period_index=2,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G7-A:MATH",
            day_index=0,
            period_index=3,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G7-A:MATH",
            day_index=0,
            period_index=4,
            duration_periods=1,
        ),
    ]

    assert "SUBJECT_DAILY_TRIPLE_CONSECUTIVE:G7-A:MATH" in validate_assignments(
        request,
        candidate,
    )


def test_validator_allows_same_day_triples_with_a_gap() -> None:
    payload = supervisor_request(
        weekly_sessions=3,
        is_main_subject=False,
        allow_double_session=False,
        sessions_per_day=6,
    ).model_dump(by_alias=True)
    payload["teachers"][0]["employmentType"] = "PART_TIME"
    payload["teachers"][0]["weeklyTeachingSessions"] = 3
    request = SolveRequest.model_validate(payload)

    accepted_patterns = [
        [0, 1, 3],
        [0, 2, 4],
        [1, 3, 5],
        [1, 2, 3],
    ]

    for periods in accepted_patterns:
        candidate = [
            Assignment(
                requirement_id="G7-A:MATH",
                day_index=0,
                period_index=period,
                duration_periods=1,
            )
            for period in periods
        ]

        assert validate_assignments(request, candidate) == []


def test_part_time_distribution_relaxes_when_availability_forces_repeat() -> None:
    payload = supervisor_request(
        weekly_sessions=3,
        is_main_subject=False,
        allow_double_session=False,
        sessions_per_day=2,
    ).model_dump(by_alias=True)
    payload["teachers"][0]["employmentType"] = "PART_TIME"
    payload["teachers"][0]["weeklyTeachingSessions"] = 3
    payload["teachers"][0]["maxLessonsPerDay"] = 2
    payload["constraintProfile"]["weights"] = {
        "PART_TIME_DISTRIBUTION_RELAXATION": 10000,
        "PART_TIME_COMPACTNESS": 10,
    }
    payload["availability"] = [
        {
            "entityType": "TEACHER",
            "entityId": "teacher",
            "dayIndex": day,
            "periodIndex": period,
            "state": "UNAVAILABLE",
        }
        for day in range(5)
        for period in range(2)
        if (day, period) not in {(0, 0), (0, 1), (1, 0)}
    ]
    request = SolveRequest.model_validate(payload)

    response = solve(request)

    assert response.status in {"FEASIBLE", "OPTIMAL"}


def test_solver_requires_a_gap_for_same_day_triple_subject_sessions() -> None:
    payload = supervisor_request(
        weekly_sessions=3,
        is_main_subject=True,
        allow_double_session=True,
        sessions_per_day=6,
        class_id="G10-A",
    ).model_dump(by_alias=True)
    payload["teachers"][0]["employmentType"] = "PART_TIME"
    payload["teachers"][0]["weeklyTeachingSessions"] = 3
    payload["teachers"][0]["maxLessonsPerDay"] = 3
    payload["weekConfiguration"]["breakAfterSession"] = 5
    payload["availability"] = [
        {
            "entityType": "TEACHER",
            "entityId": "teacher",
            "dayIndex": day,
            "periodIndex": period,
            "state": "UNAVAILABLE",
        }
        for day in range(5)
        for period in range(6)
        if day != 0
    ]
    request = SolveRequest.model_validate(payload)

    response = solve(request)

    assert response.status in {"FEASIBLE", "OPTIMAL"}
    periods = sorted(
        assignment.period_index
        for assignment in response.alternatives[0].assignments
        if assignment.day_index == 0
    )
    assert len(periods) == 3
    assert all(
        [left, middle, right] != list(range(left, left + 3))
        for left, middle, right in zip(periods, periods[1:], periods[2:], strict=False)
    )
    alternative = response.alternatives[0]
    assert validate_assignments(request, alternative.assignments) == []


def test_full_time_balance_penalty_orders_daily_distributions() -> None:
    request = supervisor_request(weekly_sessions=25)

    def candidate(counts: list[int]) -> list[Assignment]:
        return [
            Assignment(
                requirement_id="G7-A:MATH",
                day_index=day,
                period_index=period,
                duration_periods=1,
            )
            for day, count in enumerate(counts)
            for period in range(count)
        ]

    balanced = score_assignments(request, candidate([5, 5, 5, 5, 5]))
    near = score_assignments(request, candidate([6, 5, 5, 5, 4]))
    uneven = score_assignments(request, candidate([7, 7, 5, 3, 3]))

    assert balanced.breakdown["FULL_TIME_DAILY_BALANCE"] == 0
    assert (
        balanced.breakdown["FULL_TIME_DAILY_BALANCE"]
        < near.breakdown["FULL_TIME_DAILY_BALANCE"]
        < uneven.breakdown["FULL_TIME_DAILY_BALANCE"]
    )


def test_fingerprint_uses_the_exact_supplied_contract() -> None:
    request = supervisor_request()
    supplied = request.model_dump(
        by_alias=True,
        exclude={"job_id"},
        exclude_unset=True,
    )
    canonical = json.dumps(
        supplied,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )

    assert input_fingerprint(request) == hashlib.sha256(canonical.encode()).hexdigest()


def test_shared_teaching_group_counts_once_and_synchronizes_classes() -> None:
    request = supervisor_request(weekly_sessions=2)
    payload = request.model_dump(by_alias=True)
    payload["teachers"][0]["weeklyTeachingSessions"] = 2
    payload["classSections"].append(
        {
            "id": "G7-B",
            "name": "G7-B",
            "shortCode": "G7-B",
            "maxLessonsPerDay": 4,
            "recessAfterSession": 3,
        }
    )
    payload["requirements"].append(
        {
            "id": "G7-B:MATH",
            "classSectionId": "G7-B",
            "subjectId": "MATH",
            "teacherId": "teacher",
            "sharedTeachingGroupId": "math-group",
            "weeklySessions": 2,
            "isMainSubject": True,
            "allowDoubleSession": True,
            "fixedSlots": [],
            "forbiddenSlots": [],
        }
    )
    payload["requirements"][0]["sharedTeachingGroupId"] = "math-group"
    request = SolveRequest.model_validate(payload)

    response = solve(request)

    assert response.status in {"FEASIBLE", "OPTIMAL"}
    assignments = response.alternatives[0].assignments
    by_requirement = {
        requirement_id: sorted(
            (item.day_index, item.period_index)
            for item in assignments
            if item.requirement_id == requirement_id
        )
        for requirement_id in ("G7-A:MATH", "G7-B:MATH")
    }
    assert by_requirement["G7-A:MATH"] == by_requirement["G7-B:MATH"]
    assert len(by_requirement["G7-A:MATH"]) == 2
    assert validate_assignments(request, assignments) == []


def test_class_recess_does_not_block_a_teaching_session() -> None:
    request = supervisor_request(weekly_sessions=1)
    payload = request.model_dump(by_alias=True)
    payload["classSections"][0]["recessAfterSession"] = 3
    request = SolveRequest.model_validate(payload)

    candidate = [
        Assignment(
            requirement_id="G7-A:MATH",
            day_index=0,
            period_index=2,
            duration_periods=1,
        )
    ]

    assert validate_assignments(request, candidate) == []


def test_class_recess_separates_double_session_adjacency() -> None:
    request = supervisor_request(weekly_sessions=2, class_id="G10-A")
    payload = request.model_dump(by_alias=True)
    payload["classSections"][0]["recessAfterSession"] = 3
    request = SolveRequest.model_validate(payload)
    candidate = [
        Assignment(
            requirement_id="G10-A:MATH",
            day_index=0,
            period_index=2,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G10-A:MATH",
            day_index=0,
            period_index=3,
            duration_periods=1,
        ),
    ]

    assert validate_assignments(request, candidate) == []
    scored = score_assignments(request, candidate)

    assert scored.breakdown["MAIN_DOUBLE_ADJACENCY"] == 12


def test_teacher_can_cross_timing_groups_when_clock_times_do_not_overlap() -> None:
    request = supervisor_request(
        weekly_sessions=1,
        is_main_subject=False,
        allow_double_session=False,
        sessions_per_day=6,
    )
    payload = request.model_dump(by_alias=True)
    payload["teachers"][0]["weeklyTeachingSessions"] = 2
    payload["classSections"][0]["recessAfterSession"] = 3
    payload["classSections"].append(
        {
            "id": "G10-A",
            "name": "G10-A",
            "shortCode": "G10-A",
            "maxLessonsPerDay": 6,
            "recessAfterSession": 4,
        }
    )
    payload["requirements"].append(
        {
            "id": "G10-A:MATH",
            "classSectionId": "G10-A",
            "subjectId": "MATH",
            "teacherId": "teacher",
            "weeklySessions": 1,
            "isMainSubject": False,
            "allowDoubleSession": False,
            "fixedSlots": [{"dayIndex": 0, "periodIndex": 3}],
            "forbiddenSlots": [],
        }
    )
    payload["requirements"][0]["fixedSlots"] = [{"dayIndex": 0, "periodIndex": 2}]
    request = SolveRequest.model_validate(payload)
    candidate = [
        Assignment(
            requirement_id="G7-A:MATH",
            day_index=0,
            period_index=2,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G10-A:MATH",
            day_index=0,
            period_index=3,
            duration_periods=1,
        ),
    ]

    assert validate_assignments(request, candidate) == []
    response = solve(request)
    assert response.status in {"FEASIBLE", "OPTIMAL"}
    assert validate_assignments(request, response.alternatives[0].assignments) == []


def test_teacher_cannot_cross_timing_groups_when_clock_times_overlap() -> None:
    request = supervisor_request(
        weekly_sessions=1,
        is_main_subject=False,
        allow_double_session=False,
        sessions_per_day=6,
    )
    payload = request.model_dump(by_alias=True)
    payload["teachers"][0]["weeklyTeachingSessions"] = 2
    payload["classSections"][0]["recessAfterSession"] = 3
    payload["classSections"].append(
        {
            "id": "G10-A",
            "name": "G10-A",
            "shortCode": "G10-A",
            "maxLessonsPerDay": 6,
            "recessAfterSession": 4,
        }
    )
    payload["requirements"].append(
        {
            "id": "G10-A:MATH",
            "classSectionId": "G10-A",
            "subjectId": "MATH",
            "teacherId": "teacher",
            "weeklySessions": 1,
            "isMainSubject": False,
            "allowDoubleSession": False,
            "fixedSlots": [],
            "forbiddenSlots": [],
        }
    )
    request = SolveRequest.model_validate(payload)
    candidate = [
        Assignment(
            requirement_id="G7-A:MATH",
            day_index=0,
            period_index=3,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G10-A:MATH",
            day_index=0,
            period_index=3,
            duration_periods=1,
        ),
    ]

    assert "COLLISION:TEACHER_TIME:teacher" in validate_assignments(request, candidate)


def test_class_recess_uses_teaching_session_order_not_physical_period_index() -> None:
    request = supervisor_request(weekly_sessions=2, class_id="G10-A")
    payload = request.model_dump(by_alias=True)
    payload["calendar"]["periods"] = [
        {"id": "p0", "index": 0, "name": "Session 1", "isTeaching": True},
        {"id": "p1", "index": 1, "name": "Session 2", "isTeaching": True},
        {"id": "p2", "index": 2, "name": "Break", "isTeaching": False},
        {"id": "p3", "index": 3, "name": "Session 3", "isTeaching": True},
        {"id": "p4", "index": 4, "name": "Session 4", "isTeaching": True},
    ]
    payload["calendar"]["enabledSlots"] = [
        {
            "id": f"s{day}-{period}",
            "dayIndex": day,
            "periodIndex": period,
        }
        for day in range(5)
        for period in range(5)
    ]
    payload["weekConfiguration"]["breakAfterSession"] = 2
    payload["classSections"][0]["recessAfterSession"] = 3
    request = SolveRequest.model_validate(payload)
    candidate = [
        Assignment(
            requirement_id="G10-A:MATH",
            day_index=0,
            period_index=3,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G10-A:MATH",
            day_index=0,
            period_index=4,
            duration_periods=1,
        ),
    ]

    assert validate_assignments(request, candidate) == []
    scored = score_assignments(request, candidate)

    assert scored.breakdown["MAIN_DOUBLE_ADJACENCY"] == 12


def test_teacher_collision_uses_class_clock_intervals() -> None:
    request = supervisor_request(weekly_sessions=1)
    payload = request.model_dump(by_alias=True)
    payload["weekConfiguration"] = {
        "workingDayCount": 5,
        "sessionsPerDay": 6,
        "sessionDurationMinutes": 55,
        "firstSessionStartMinutes": 450,
        "breakAfterSession": 3,
        "breakDurationMinutes": 30,
    }
    payload["calendar"]["periods"] = [
        {"id": f"p{period}", "index": period, "name": f"Session {period + 1}", "isTeaching": True}
        for period in range(6)
    ]
    payload["calendar"]["enabledSlots"] = [
        {
            "id": f"s{day}-{period}",
            "dayIndex": day,
            "periodIndex": period,
        }
        for day in range(5)
        for period in range(6)
    ]
    payload["teachers"][0]["weeklyTeachingSessions"] = 2
    payload["classSections"][0]["recessAfterSession"] = 2
    payload["classSections"].append(
        {
            "id": "G10-A",
            "name": "G10-A",
            "shortCode": "G10-A",
            "maxLessonsPerDay": None,
            "recessAfterSession": 4,
        }
    )
    payload["requirements"].append(
        {
            "id": "G10-A:MATH",
            "classSectionId": "G10-A",
            "subjectId": "MATH",
            "teacherId": "teacher",
            "sharedTeachingGroupId": None,
            "weeklySessions": 1,
            "isMainSubject": True,
            "allowDoubleSession": False,
            "fixedSlots": [],
            "forbiddenSlots": [],
        }
    )
    request = SolveRequest.model_validate(payload)
    overlapping = [
        Assignment(
            requirement_id="G7-A:MATH",
            day_index=0,
            period_index=2,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G10-A:MATH",
            day_index=0,
            period_index=3,
            duration_periods=1,
        ),
    ]

    errors = validate_assignments(request, overlapping)
    response = solve(request)

    assert "COLLISION:TEACHER_TIME:teacher" in errors
    assert response.status in {"FEASIBLE", "OPTIMAL"}
    generated = response.alternatives[0].assignments
    assert validate_assignments(request, generated) == []


def test_teacher_cannot_have_more_than_two_daily_internal_gaps() -> None:
    request = supervisor_request(weekly_sessions=2, sessions_per_day=6)
    candidate = [
        Assignment(
            requirement_id="G7-A:MATH",
            day_index=0,
            period_index=0,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G7-A:MATH",
            day_index=0,
            period_index=4,
            duration_periods=1,
        ),
    ]

    assert "TEACHER_DAILY_INTERNAL_GAPS:teacher" in validate_assignments(
        request,
        candidate,
    )


def test_teacher_daily_internal_gap_limit_is_a_solver_hard_constraint() -> None:
    request = supervisor_request(weekly_sessions=2, sessions_per_day=6)
    payload = request.model_dump(by_alias=True)
    payload["requirements"][0]["fixedSlots"] = [
        {"dayIndex": 0, "periodIndex": 0},
        {"dayIndex": 0, "periodIndex": 4},
    ]
    request = SolveRequest.model_validate(payload)
    response = solve(request)

    assert response.status == "INFEASIBLE"


def test_teacher_allows_two_daily_internal_gaps() -> None:
    request = supervisor_request(weekly_sessions=2, sessions_per_day=6, class_id="G10-A")
    candidate = [
        Assignment(
            requirement_id="G10-A:MATH",
            day_index=0,
            period_index=0,
            duration_periods=1,
        ),
        Assignment(
            requirement_id="G10-A:MATH",
            day_index=0,
            period_index=3,
            duration_periods=1,
        ),
    ]

    assert validate_assignments(request, candidate) == []
