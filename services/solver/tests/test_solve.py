import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.main import app
from app.models import SolveRequest
from app.solver import solve
from app.validator import validate_assignments

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "minimal_feasible.json"
client = TestClient(app)


def load_fixture() -> dict[str, Any]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def test_fixture_a_solves_with_exact_counts_and_no_hard_violations() -> None:
    request = SolveRequest.model_validate(load_fixture())

    response = solve(request)

    assert response.status in {"FEASIBLE", "OPTIMAL"}
    assert len(response.alternatives) == 1
    assignments = response.alternatives[0].assignments
    assert len(assignments) == 10
    assert validate_assignments(request, assignments) == []
    assert response.alternatives[0].total_penalty == sum(
        response.alternatives[0].penalty_breakdown.values()
    )
    assert set(response.alternatives[0].penalty_breakdown) == set(
        request.constraint_profile.weights
    )
    part_time_assignments = [
        assignment
        for assignment in assignments
        if next(
            requirement
            for requirement in request.requirements
            if requirement.id == assignment.requirement_id
        ).teacher_id
        == "teacher-part-time"
    ]
    assert all(assignment.period_index != 0 for assignment in part_time_assignments)


def test_solve_api_returns_contract_and_fingerprint() -> None:
    response = client.post("/v1/solve", json=load_fixture())

    assert response.status_code == 200
    body = response.json()
    assert body["status"] in {"FEASIBLE", "OPTIMAL"}
    assert len(body["inputFingerprint"]) == 64
    assert body["variableCount"] > 0
    assert body["constraintCount"] > 0


def test_validate_api_rejects_a_teacher_collision() -> None:
    payload = load_fixture()
    fixture = json.loads(
        (FIXTURE_PATH.parent / "manual_move_rejection.json").read_text(encoding="utf-8")
    )
    original_assignments = fixture["assignments"]

    response = client.post(
        "/v1/validate",
        json={"input": payload, "assignments": original_assignments},
    )

    assert response.status_code == 200
    assert response.json()["valid"] is False
    assert fixture["expectedCode"] in response.json()["errors"]
    assert response.json()["totalPenalty"] >= 0
    assert fixture["assignments"] == original_assignments


def test_fixture_f_returns_distinct_quality_bounded_alternatives() -> None:
    fixture = json.loads((FIXTURE_PATH.parent / "alternatives.json").read_text(encoding="utf-8"))
    payload = load_fixture()
    payload["options"] = fixture["options"]
    request = SolveRequest.model_validate(payload)

    response = solve(request)

    assert len(response.alternatives) == fixture["expectedAlternativeCount"]
    best = response.alternatives[0].total_penalty
    quality_limit = best * (100 + request.options.max_quality_degradation_percent) // 100
    signatures = [
        {
            (
                assignment.requirement_id,
                assignment.day_index,
                assignment.period_index,
                assignment.room_id,
            )
            for assignment in alternative.assignments
        }
        for alternative in response.alternatives
    ]
    assert all(
        left != right for index, left in enumerate(signatures) for right in signatures[index + 1 :]
    )
    assert all(alternative.total_penalty <= quality_limit for alternative in response.alternatives)
    assert all(alternative.diversity_score is not None for alternative in response.alternatives)
