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
