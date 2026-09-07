import re

from app.models import ClassSection, SolveRequest

PRIMARY_AND_MIDDLE_GRADES = frozenset(range(1, 10))


def class_section_grade(class_section: ClassSection) -> int | None:
    candidates = [class_section.short_code, class_section.name, class_section.id]
    for candidate in candidates:
        if not candidate:
            continue
        eb_match = re.search(r"(?<![A-Z0-9])EB\s*([1-9])(?!\d)", candidate, re.IGNORECASE)
        if eb_match:
            return int(eb_match.group(1))
        grade_match = re.search(
            r"(?<!\d)(?:G|GRADE\s*)?([1-9])(?!\d)",
            candidate,
            re.IGNORECASE,
        )
        if grade_match:
            return int(grade_match.group(1))
    return None


def requires_main_subject_weekly_pair(
    request: SolveRequest,
    class_section_id: str,
) -> bool:
    if request.schema_version != 2:
        return False
    class_section = next(item for item in request.class_sections if item.id == class_section_id)
    grade = class_section_grade(class_section)
    return grade in PRIMARY_AND_MIDDLE_GRADES
