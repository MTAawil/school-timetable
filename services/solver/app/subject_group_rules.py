import re

from app.models import Subject

SOCIAL_STUDIES_DAILY_LIMIT_CODE = "SOCIAL_STUDIES_DAILY_LIMIT"
SOCIAL_STUDIES_SUBJECT_KEYS = frozenset({"HISTORY", "GEOGRAPHY", "CIVICS", "RELIGION"})
SOCIAL_STUDIES_SUBJECT_LABELS = frozenset(
    {"history", "geography", "civics", "religion", "تاريخ", "جغرافيا", "اجتماع", "دين"}
)


def _subject_key(value: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "_", value.upper()).strip("_")


def _subject_label(value: str) -> str:
    return " ".join(value.casefold().split())


def is_social_studies_limited_subject(subject: Subject) -> bool:
    return (
        _subject_key(subject.id) in SOCIAL_STUDIES_SUBJECT_KEYS
        or _subject_key(subject.name) in SOCIAL_STUDIES_SUBJECT_KEYS
        or _subject_label(subject.name) in SOCIAL_STUDIES_SUBJECT_LABELS
    )
