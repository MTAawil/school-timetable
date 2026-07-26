from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_reports_service_and_ortools_version() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "solver"
    assert body["status"] == "ok"
    assert body["version"] == "0.1.0"
    assert body["ortoolsVersion"]


def test_solver_rejects_declared_oversized_payload() -> None:
    response = client.post(
        "/v1/solve",
        content=b"{}",
        headers={"content-length": str(5 * 1024 * 1024 + 1)},
    )

    assert response.status_code == 413
    assert response.json()["code"] == "PAYLOAD_TOO_LARGE"


def test_solver_enforces_configured_internal_token(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("SOLVER_INTERNAL_TOKEN", "test-internal-token")

    response = client.post("/v1/solve", json={})

    assert response.status_code == 401
    assert response.json()["code"] == "SOLVER_UNAUTHORIZED"
