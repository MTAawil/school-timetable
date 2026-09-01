import hashlib
import json
from typing import Any

from app.models import Assignment, SolveRequest
from app.scoring import score_assignments
from app.solver import input_fingerprint, solve
from app.validator import validate_assignments


def supervisor_request(
    *,
    weekly_sessions: int = 6,
    is_main_subject: bool = True,
    allow_double_session: bool = True,
    sessions_per_day: int = 4,
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
                "id": "G7-A",
                "name": "G7-A",
                "shortCode": "G7-A",
                "maxLessonsPerDay": sessions_per_day,
            }
        ],
        "rooms": [],
        "requirements": [
            {
                "id": "G7-A:MATH",
                "classSectionId": "G7-A",
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
    request = supervisor_request(weekly_sessions=2)
    payload = request.model_dump(by_alias=True)
    payload["classSections"][0]["recessAfterSession"] = 3
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
    ]

    assert validate_assignments(request, candidate) == []
    scored = score_assignments(request, candidate)

    assert scored.breakdown["MAIN_DOUBLE_ADJACENCY"] == 12


def test_class_recess_uses_teaching_session_order_not_physical_period_index() -> None:
    request = supervisor_request(weekly_sessions=2)
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
