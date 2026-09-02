import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from ortools.sat.python import cp_model

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


def test_fixture_g_keeps_locks_and_reports_regeneration_moves() -> None:
    fixture = json.loads(
        (FIXTURE_PATH.parent / "locked_regeneration.json").read_text(encoding="utf-8")
    )
    baseline_request = SolveRequest.model_validate(load_fixture())
    baseline = solve(baseline_request).alternatives[0].assignments
    locked = baseline[: fixture["lockCount"]]
    forced = baseline[fixture["forcedMoveAssignmentIndex"]]

    payload = load_fixture()
    payload["jobId"] = "fixture-g-regeneration"
    payload["lockedAssignments"] = [assignment.model_dump(by_alias=True) for assignment in locked]
    payload["existingAssignments"] = [
        assignment.model_dump(by_alias=True) for assignment in baseline
    ]
    payload["options"]["alternativeCount"] = 1
    payload["options"]["useExistingScheduleHint"] = True
    requirement = next(
        item for item in payload["requirements"] if item["id"] == forced.requirement_id
    )
    requirement["forbiddenSlots"].append(
        {"dayIndex": forced.day_index, "periodIndex": forced.period_index}
    )

    response = solve(SolveRequest.model_validate(payload))

    assert response.status in {"FEASIBLE", "OPTIMAL"}
    regenerated = response.alternatives[0]
    locked_positions = {
        (
            assignment.requirement_id,
            assignment.day_index,
            assignment.period_index,
            assignment.room_id,
        )
        for assignment in locked
    }
    regenerated_positions = {
        (
            assignment.requirement_id,
            assignment.day_index,
            assignment.period_index,
            assignment.room_id,
        )
        for assignment in regenerated.assignments
    }
    assert locked_positions <= regenerated_positions
    assert validate_assignments(SolveRequest.model_validate(payload), regenerated.assignments) == []
    assert len(regenerated.moved_assignments) >= fixture["expectedMinimumMovedAssignments"]
    assert regenerated.movement_penalty >= fixture["expectedMinimumMovedAssignments"]
    assert response.solver_telemetry.stage1.status in {"FEASIBLE", "OPTIMAL"}
    assert response.solver_telemetry.final_source == "STAGE2_OPTIMIZED"


def test_infeasible_response_contains_deterministic_diagnostics_only() -> None:
    payload = load_fixture()
    requirement = next(item for item in payload["requirements"] if item["id"] == "r1")
    requirement["fixedSlots"] = [{"dayIndex": 0, "periodIndex": 99}]

    response = solve(SolveRequest.model_validate(payload))

    assert response.status == "INFEASIBLE"
    assert response.alternatives == []
    assert response.diagnostics
    assert response.diagnostics[0]["code"] == "NO_COMPATIBLE_PLACEMENT"


def test_solver_timeout_is_not_reported_as_infeasible(monkeypatch: Any) -> None:
    monkeypatch.setattr(cp_model.CpSolver, "solve", lambda self, model: cp_model.UNKNOWN)
    request = SolveRequest.model_validate(load_fixture())

    response = solve(request)

    assert response.status == "FAILED"
    assert response.alternatives == []
    assert response.diagnostics == [
        {
            "code": "SOLVER_TIME_LIMIT_REACHED",
            "summary": (
                "The solver reached its time limit without proving feasibility or infeasibility."
            ),
            "solverStatus": "UNKNOWN",
            "timeLimitSeconds": request.options.time_limit_seconds,
        }
    ]
    assert response.solver_telemetry.stage1.status == "UNKNOWN"
    assert response.solver_telemetry.stage2 is not None
    assert response.solver_telemetry.stage2.status == "UNKNOWN"
    assert response.solver_telemetry.final_source == "NONE"


def test_stage_one_has_no_soft_objective_and_stage_two_keeps_objective(
    monkeypatch: Any,
) -> None:
    original_solve = cp_model.CpSolver.solve
    objective_sizes: list[int] = []

    def record_objective_size(self: cp_model.CpSolver, model: cp_model.CpModel) -> int:
        objective_sizes.append(len(model.proto.objective.vars))
        return original_solve(self, model)

    monkeypatch.setattr(cp_model.CpSolver, "solve", record_objective_size)
    request = SolveRequest.model_validate(load_fixture())

    response = solve(request)

    assert response.status in {"FEASIBLE", "OPTIMAL"}
    assert objective_sizes[0] == 0
    assert objective_sizes[1] > 0


def test_stage_one_feasible_stage_two_timeout_returns_valid_fallback(
    monkeypatch: Any,
) -> None:
    original_solve = cp_model.CpSolver.solve
    call_count = 0

    def solve_first_stage_only(self: cp_model.CpSolver, model: cp_model.CpModel) -> int:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return original_solve(self, model)
        return cp_model.UNKNOWN

    monkeypatch.setattr(cp_model.CpSolver, "solve", solve_first_stage_only)
    request = SolveRequest.model_validate(load_fixture())

    response = solve(request)

    assert response.status == "FEASIBLE"
    assert len(response.alternatives) == 1
    assert validate_assignments(request, response.alternatives[0].assignments) == []
    assert response.diagnostics == []
    assert response.warnings == [
        "Optimization reached the time limit after a hard-feasible timetable was found."
    ]
    assert response.solver_telemetry.stage1.status in {"FEASIBLE", "OPTIMAL"}
    assert response.solver_telemetry.stage2 is not None
    assert response.solver_telemetry.stage2.status == "UNKNOWN"
    assert response.solver_telemetry.final_source == "STAGE1_FALLBACK"


def test_proven_stage_one_infeasible_is_reported_as_infeasible(monkeypatch: Any) -> None:
    monkeypatch.setattr(cp_model.CpSolver, "solve", lambda self, model: cp_model.INFEASIBLE)
    request = SolveRequest.model_validate(load_fixture())

    response = solve(request)

    assert response.status == "INFEASIBLE"
    assert response.alternatives == []
    assert response.solver_telemetry.stage1.status == "INFEASIBLE"
    assert response.solver_telemetry.stage2 is None
    assert response.solver_telemetry.final_source == "NONE"
