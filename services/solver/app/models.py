from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


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


class WeekConfiguration(ContractModel):
    working_day_count: int = Field(ge=1)
    sessions_per_day: int = Field(ge=1)
    session_duration_minutes: int = Field(ge=1)
    break_after_session: int = Field(ge=1)
    break_duration_minutes: int = Field(ge=1)


class Teacher(ContractModel):
    id: str
    name: str
    employment_type: Literal["FULL_TIME", "PART_TIME"] = "FULL_TIME"
    max_lessons_per_day: int | None = Field(default=None, ge=1)
    max_consecutive_lessons: int | None = Field(default=None, ge=1)
    weekly_teaching_sessions: int | None = Field(default=None, ge=0)


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
    weekly_occurrences: int | None = Field(default=None, ge=1)
    duration_periods: int | None = Field(default=None, ge=1)
    max_occurrences_per_day: int | None = Field(default=None, ge=1)
    minimum_distinct_days: int | None = Field(default=None, ge=1)
    weekly_sessions: int | None = Field(default=None, ge=1)
    is_main_subject: bool = False
    allow_double_session: bool = False
    required_room_id: str | None = None
    required_room_type: str | None = None
    fixed_slots: list[Position]
    forbidden_slots: list[Position]

    @model_validator(mode="after")
    def validate_demand(self) -> "Requirement":
        legacy = self.weekly_occurrences is not None and self.duration_periods is not None
        redesigned = self.weekly_sessions is not None
        if legacy == redesigned:
            raise ValueError("Requirement must contain exactly one demand representation.")
        return self

    @property
    def occurrence_count(self) -> int:
        return self.weekly_sessions or self.weekly_occurrences or 0

    @property
    def occurrence_duration(self) -> int:
        return 1 if self.weekly_sessions is not None else self.duration_periods or 1

    @property
    def daily_occurrence_limit(self) -> int:
        if self.weekly_sessions is not None:
            return 2 if self.is_main_subject and self.allow_double_session else 1
        return self.max_occurrences_per_day or 1

    @property
    def distinct_day_minimum(self) -> int:
        return self.minimum_distinct_days or 1


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


class MovedAssignment(ContractModel):
    requirement_id: str
    before: Position
    after: Position


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
    schema_version: Literal[1, 2]
    job_id: str
    school: School
    term: Term
    calendar: Calendar
    week_configuration: WeekConfiguration | None = None
    teachers: list[Teacher]
    subjects: list[Subject]
    class_sections: list[ClassSection]
    rooms: list[Room]
    requirements: list[Requirement]
    availability: list[Availability]
    locked_assignments: list[Assignment]
    existing_assignments: list[Assignment] = []
    constraint_profile: ConstraintProfile
    options: SolveOptions

    @model_validator(mode="after")
    def validate_schema_demand(self) -> "SolveRequest":
        for requirement in self.requirements:
            if self.schema_version == 1 and requirement.weekly_occurrences is None:
                raise ValueError("Schema version 1 requires weeklyOccurrences.")
            if self.schema_version == 2 and requirement.weekly_sessions is None:
                raise ValueError("Schema version 2 requires weeklySessions.")
        if self.schema_version == 2 and any(
            teacher.weekly_teaching_sessions is None for teacher in self.teachers
        ):
            raise ValueError("Schema version 2 requires declared teacher workloads.")
        return self


class Alternative(ContractModel):
    rank: int
    solver_status: Literal["FEASIBLE", "OPTIMAL"]
    total_penalty: int
    diversity_score: int | None = None
    penalty_breakdown: dict[str, int]
    assignments: list[Assignment]
    movement_penalty: int = 0
    moved_assignments: list[MovedAssignment] = []
    runtime_ms: int
    warnings: list[str]


class SolveResponse(ContractModel):
    schema_version: Literal[1, 2]
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
