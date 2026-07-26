import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from ortools.init.python import init  # type: ignore[import-untyped]

from app.models import SolveRequest, SolveResponse, ValidateRequest, ValidateResponse
from app.scoring import score_assignments
from app.solver import solve
from app.validator import validate_assignments

SERVICE_VERSION = "0.1.0"

app = FastAPI(
    title="School Timetable Solver",
    version=SERVICE_VERSION,
    docs_url="/docs",
    redoc_url=None,
)

MAX_REQUEST_BYTES = 5 * 1024 * 1024


@app.middleware("http")
async def enforce_request_boundary(request: Request, call_next):  # type: ignore[no-untyped-def]
    if request.method in {"POST", "PUT", "PATCH"}:
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_REQUEST_BYTES:
            return JSONResponse(
                status_code=413,
                content={"code": "PAYLOAD_TOO_LARGE", "message": "Request payload exceeds 5 MB."},
            )
        expected_token = os.getenv("SOLVER_INTERNAL_TOKEN")
        if expected_token and request.headers.get("x-solver-token") != expected_token:
            return JSONResponse(
                status_code=401,
                content={"code": "SOLVER_UNAUTHORIZED", "message": "Solver token is invalid."},
            )
    return await call_next(request)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "service": "solver",
        "status": "ok",
        "version": SERVICE_VERSION,
        "ortoolsVersion": init.OrToolsVersion.version_string(),
    }


@app.post("/v1/solve", response_model=SolveResponse, response_model_by_alias=True)
def solve_timetable(request: SolveRequest) -> SolveResponse:
    return solve(request)


@app.post("/v1/validate", response_model=ValidateResponse, response_model_by_alias=True)
def validate_timetable(request: ValidateRequest) -> ValidateResponse:
    errors = validate_assignments(
        request.input,
        request.assignments,
        allow_incomplete=request.allow_incomplete,
    )
    score = score_assignments(request.input, request.assignments)
    return ValidateResponse(
        valid=not errors,
        errors=errors,
        total_penalty=score.total,
        penalty_breakdown=score.breakdown,
    )


@app.exception_handler(Exception)
async def handle_unexpected_error(
    _request: Request,
    _error: Exception,
) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={
            "code": "INTERNAL_ERROR",
            "message": "The solver service could not complete the request.",
        },
    )
