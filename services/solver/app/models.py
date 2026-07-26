from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class ContractModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class School(ContractModel):
    id: str
    name: str
    timezone: str


class Term(ContractModel):
    id: str
    name: str
    rooms_enabled: bool


class Day(ContractModel):
    id: str
    index: int = Field(ge=0)
    name: str
    is_working: bool


class Period(ContractModel):
    id: str
    index: int = Field(ge=0)
    name: str
    is_teaching: bool


class Slot(ContractModel):
    id: str
    day_index: int = Field(ge=0)
    period_index: int = Field(ge=0)


class Calendar(ContractModel):
    days: list[Day]
    periods: list[Period]
    enabled_slots: list[Slot]


class Teacher(ContractModel):
    id: str
    name: str
    employment_type: Literal["FULL_TIME", "PART_TIME"] = "FULL_TIME"
    max_lessons_per_day: int | None = Field(default=None, ge=1)
    max_consecutive_lessons: int | None = Field(default=None, ge=1)


class Subject(ContractModel):
    id: str
    name: str
    preferred_time_band: Literal["EARLY", "NEUTRAL", "LATE"] = "NEUTRAL"
    consecutive_periods_preferred: bool = False
    default_room_type: str | None = None


class ClassSection(ContractModel):
    id: str
    name: str
    max_lessons_per_day: int | None = Field(default=None, ge=1)


class Room(ContractModel):
    id: str
    name: str
    type: str
    capacity: int | None = Field(default=None, ge=1)


class Position(ContractModel):
    day_index: int = Field(ge=0)
    period_index: int = Field(ge=0)


class Requirement(ContractModel):
    id: str
    class_section_id: str
    subject_id: str
    teacher_id: str
    weekly_occurrences: int = Field(ge=1)
    duration_periods: int = Field(ge=1)
    max_occurrences_per_day: int = Field(ge=1)
    minimum_distinct_days: int = Field(ge=1)
    required_room_id: str | None = None
    required_room_type: str | None = None
    fixed_slots: list[Position]
    forbidden_slots: list[Position]


class Availability(ContractModel):
    entity_type: Literal["TEACHER", "CLASS_SECTION", "ROOM"]
    entity_id: str
    day_index: int = Field(ge=0)
    period_index: int = Field(ge=0)
    state: Literal["AVAILABLE", "PREFERRED", "DISLIKED", "UNAVAILABLE"]


class Assignment(ContractModel):
    requirement_id: str
    day_index: int = Field(ge=0)
    period_index: int = Field(ge=0)
    duration_periods: int = Field(ge=1)
    room_id: str | None = None


class ConstraintProfile(ContractModel):
    id: str | None
    weights: dict[str, int]


class SolveOptions(ContractModel):
    alternative_count: int = Field(default=1, ge=1, le=5)
    time_limit_seconds: int = Field(default=30, ge=1, le=300)
    random_seed: int = 12345
    max_quality_degradation_percent: int = Field(default=20, ge=0, le=100)
    rooms_enabled: bool
    use_existing_schedule_hint: bool = False


class SolveRequest(ContractModel):
    schema_version: Literal[1]
    job_id: str
    school: School
    term: Term
    calendar: Calendar
    teachers: list[Teacher]
    subjects: list[Subject]
    class_sections: list[ClassSection]
    rooms: list[Room]
    requirements: list[Requirement]
    availability: list[Availability]
    locked_assignments: list[Assignment]
    constraint_profile: ConstraintProfile
    options: SolveOptions


class Alternative(ContractModel):
    rank: int
    solver_status: Literal["FEASIBLE", "OPTIMAL"]
    total_penalty: int
    diversity_score: int | None = None
    penalty_breakdown: dict[str, int]
    assignments: list[Assignment]
    runtime_ms: int
    warnings: list[str]


class SolveResponse(ContractModel):
    schema_version: Literal[1] = 1
    job_id: str
    input_fingerprint: str
    status: Literal["FEASIBLE", "OPTIMAL", "INFEASIBLE", "FAILED"]
    runtime_ms: int
    alternatives: list[Alternative]
    diagnostics: list[dict[str, object]]
    warnings: list[str]
    variable_count: int
    constraint_count: int


class ValidateRequest(ContractModel):
    input: SolveRequest
    assignments: list[Assignment]
    allow_incomplete: bool = False


class ValidateResponse(ContractModel):
    valid: bool
    errors: list[str]
    total_penalty: int
    penalty_breakdown: dict[str, int]
