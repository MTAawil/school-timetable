import json
from pathlib import Path
from typing import Any

from app.models import Assignment, SolveRequest
from app.scoring import score_assignments

FIXTURE_DIRECTORY = Path(__file__).parent / "fixtures"


def load_json(name: str) -> dict[str, Any]:
    return json.loads((FIXTURE_DIRECTORY / name).read_text(encoding="utf-8"))


def request_with_weights(weights: dict[str, int]) -> SolveRequest:
    data = load_json("minimal_feasible.json")
    data["constraintProfile"]["weights"] = weights
    return SolveRequest.model_validate(data)


def assignments(data: list[dict[str, Any]]) -> list[Assignment]:
    return [Assignment.model_validate(item) for item in data]


def test_fixture_i_spread_pattern_has_lower_subject_spread_penalty() -> None:
    fixture = load_json("soft_scoring.json")["fixtureI"]
    request = request_with_weights(fixture["weight"])

    spread = score_assignments(request, assignments(fixture["spread"]))
    compressed = score_assignments(request, assignments(fixture["compressed"]))

    assert spread.breakdown["SUBJECT_SPREAD"] < compressed.breakdown["SUBJECT_SPREAD"]


def test_fixture_j_compact_part_time_pattern_has_lower_gap_penalty() -> None:
    fixture = load_json("soft_scoring.json")["fixtureJ"]
    request = request_with_weights(fixture["weight"])

    compact = score_assignments(request, assignments(fixture["compact"]))
    gapped = score_assignments(request, assignments(fixture["gapped"]))

    assert (
        compact.breakdown.get("PART_TIME_COMPACTNESS", 0)
        < gapped.breakdown["PART_TIME_COMPACTNESS"]
    )


def test_teacher_free_time_preferences_penalize_extra_gap_and_free_pair() -> None:
    request = request_with_weights(
        {
            "TEACHER_MAX_ONE_GAP": 200,
            "TEACHER_CONSECUTIVE_FREE": 200,
            "TEACHER_FIRST_TWO_FREE": 200,
        }
    )
    request = request.model_copy(update={"schema_version": 2})
    compact = assignments(
        [
            {"requirementId": "r1", "dayIndex": 0, "periodIndex": 1, "durationPeriods": 1},
            {"requirementId": "r1", "dayIndex": 0, "periodIndex": 2, "durationPeriods": 1},
            {"requirementId": "r1", "dayIndex": 0, "periodIndex": 3, "durationPeriods": 1},
        ]
    )
    gapped = assignments(
        [
            {"requirementId": "r1", "dayIndex": 0, "periodIndex": 0, "durationPeriods": 1},
            {"requirementId": "r1", "dayIndex": 0, "periodIndex": 3, "durationPeriods": 1},
        ]
    )

    compact_score = score_assignments(request, compact)
    gapped_score = score_assignments(request, gapped)
    first_two_free = score_assignments(
        request,
        assignments(
            [
                {
                    "requirementId": "r1",
                    "dayIndex": 0,
                    "periodIndex": 2,
                    "durationPeriods": 1,
                }
            ]
        ),
    )

    assert compact_score.breakdown.get("TEACHER_MAX_ONE_GAP", 0) == 0
    assert gapped_score.breakdown["TEACHER_MAX_ONE_GAP"] == 200
    assert gapped_score.breakdown["TEACHER_CONSECUTIVE_FREE"] == 200
    assert first_two_free.breakdown["TEACHER_FIRST_TWO_FREE"] == 200
