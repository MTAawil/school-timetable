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
) -> SolveRequest:
    days = [
        {"id": f"d{day}", "index": day, "name": f"Day {day}", "isWorking": True} for day in range(5)
    ]
    periods = [
        {"id": f"p{period}", "index": period, "name": f"P{period}", "isTeaching": True}
        for period in range(4)
    ]
    slots = [
        {
            "id": f"s{day}-{period}",
            "dayIndex": day,
            "periodIndex": period,
        }
        for day in range(5)
        for period in range(4)
    ]
    payload: dict[str, Any] = {
        "schemaVersion": 2,
        "jobId": "supervisor-rules",
        "school": {"id": "school", "name": "School", "timezone": "Asia/Beirut"},
        "term": {"id": "term", "name": "Term", "roomsEnabled": False},
        "weekConfiguration": {
            "workingDayCount": 5,
            "sessionsPerDay": 4,
            "sessionDurationMinutes": 45,
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
                "maxLessonsPerDay": 4,
                "maxConsecutiveLessons": 4,
            }
        ],
        "subjects": [{"id": "MATH", "name": "MATH"}],
        "classSections": [
            {
                "id": "G7-A",
                "name": "G7-A",
                "shortCode": "G7-A",
                "maxLessonsPerDay": 4,
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
