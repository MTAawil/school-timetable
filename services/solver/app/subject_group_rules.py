import re

from app.models import ClassSection, Subject

SOCIAL_STUDIES_DAILY_LIMIT_CODE = "SOCIAL_STUDIES_DAILY_LIMIT"
SOCIAL_STUDIES_DAILY_SPREAD_CODE = "SOCIAL_STUDIES_DAILY_SPREAD"
SOCIAL_STUDIES_DAILY_LIMIT = 2
SOCIAL_STUDIES_DAILY_PREFERRED_LIMIT = 1
ES_SE_SOCIAL_STUDIES_DAILY_LIMIT = 4
ES_SE_SOCIAL_STUDIES_DAILY_PREFERRED_LIMIT = 3
SOCIAL_STUDIES_SUBJECT_KEYS = frozenset({"HISTORY", "GEOGRAPHY", "CIVICS", "RELIGION"})
UPPER_SECONDARY_SOCIAL_STUDIES_SUBJECT_KEYS = frozenset(
    {"SOCIOLOGY", "SOCIAL_STUDIES", "ECONOMICS", "PHILOSOPHY"}
)
LS_SV_SOCIAL_STUDIES_SUBJECT_KEYS = frozenset({"HISTORY", "GEOGRAPHY", "CIVICS", "PHILOSOPHY"})
SOCIAL_STUDIES_SUBJECT_LABELS = frozenset(
    {
        "history",
        "geography",
        "civics",
        "religion",
        "\u062a\u0627\u0631\u064a\u062e",
        "\u062c\u063a\u0631\u0627\u0641\u064a\u0627",
        "\u062a\u0631\u0628\u064a\u0629",
        "\u062f\u064a\u0646",
    }
)
UPPER_SECONDARY_SOCIAL_STUDIES_SUBJECT_LABELS = frozenset(
    {
        "sociology",
        "social studies",
        "economics",
        "philosophy",
        "\u0627\u062c\u062a\u0645\u0627\u0639",
        "\u0627\u0642\u062a\u0635\u0627\u062f",
        "\u0641\u0644\u0633\u0641\u0629",
    }
)
LS_SV_SOCIAL_STUDIES_SUBJECT_LABELS = frozenset(
    {
        "history",
        "geography",
        "civics",
        "philosophy",
        "\u062a\u0627\u0631\u064a\u062e",
        "\u062c\u063a\u0631\u0627\u0641\u064a\u0627",
        "\u062a\u0631\u0628\u064a\u0629",
        "\u0641\u0644\u0633\u0641\u0629",
    }
)
UPPER_SECONDARY_SOCIAL_STUDIES_GRADE_PREFIXES = ("G10", "G11")
ES_SE_SOCIAL_STUDIES_CLASS_CODES = frozenset({"ES", "SE"})
LS_SV_SOCIAL_STUDIES_CLASS_CODES = frozenset({"LS", "SV"})


def _subject_key(value: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "_", value.upper()).strip("_")


def _subject_label(value: str) -> str:
    return " ".join(value.casefold().split())


def _is_subject_in_group(
    subject: Subject,
    *,
    keys: frozenset[str],
    labels: frozenset[str],
) -> bool:
    return (
        _subject_key(subject.id) in keys
        or _subject_key(subject.name) in keys
        or _subject_label(subject.name) in labels
    )


def is_grade_ten_or_eleven(class_section: ClassSection) -> bool:
    labels = (class_section.name, class_section.short_code or "", class_section.id)
    return any(
        _subject_key(label).startswith(prefix)
        for label in labels
        for prefix in UPPER_SECONDARY_SOCIAL_STUDIES_GRADE_PREFIXES
    )


def _has_class_code(class_section: ClassSection, codes: frozenset[str]) -> bool:
    labels = (class_section.name, class_section.short_code or "", class_section.id)
    return any(_subject_key(label) in codes for label in labels)


def is_es_or_se(class_section: ClassSection) -> bool:
    return _has_class_code(class_section, ES_SE_SOCIAL_STUDIES_CLASS_CODES)


def is_ls_or_sv(class_section: ClassSection) -> bool:
    return _has_class_code(class_section, LS_SV_SOCIAL_STUDIES_CLASS_CODES)


def is_social_studies_limited_subject(
    subject: Subject,
    class_section: ClassSection | None = None,
) -> bool:
    if class_section is not None and is_ls_or_sv(class_section):
        return _is_subject_in_group(
            subject,
            keys=LS_SV_SOCIAL_STUDIES_SUBJECT_KEYS,
            labels=LS_SV_SOCIAL_STUDIES_SUBJECT_LABELS,
        )
    if class_section is not None and is_es_or_se(class_section):
        return _is_subject_in_group(
            subject,
            keys=SOCIAL_STUDIES_SUBJECT_KEYS - frozenset({"RELIGION"}),
            labels=SOCIAL_STUDIES_SUBJECT_LABELS - frozenset({"\u062f\u064a\u0646", "religion"}),
        ) or _is_subject_in_group(
            subject,
            keys=UPPER_SECONDARY_SOCIAL_STUDIES_SUBJECT_KEYS,
            labels=UPPER_SECONDARY_SOCIAL_STUDIES_SUBJECT_LABELS,
        )
    if _is_subject_in_group(
        subject,
        keys=SOCIAL_STUDIES_SUBJECT_KEYS,
        labels=SOCIAL_STUDIES_SUBJECT_LABELS,
    ):
        return True
    return bool(
        class_section is not None
        and is_grade_ten_or_eleven(class_section)
        and _is_subject_in_group(
            subject,
            keys=UPPER_SECONDARY_SOCIAL_STUDIES_SUBJECT_KEYS,
            labels=UPPER_SECONDARY_SOCIAL_STUDIES_SUBJECT_LABELS,
        )
    )


def social_studies_daily_limit(class_section: ClassSection) -> int:
    return (
        ES_SE_SOCIAL_STUDIES_DAILY_LIMIT
        if is_es_or_se(class_section)
        else SOCIAL_STUDIES_DAILY_LIMIT
    )


def social_studies_daily_preferred_limit(class_section: ClassSection) -> int | None:
    if is_es_or_se(class_section):
        return ES_SE_SOCIAL_STUDIES_DAILY_PREFERRED_LIMIT
    if is_grade_ten_or_eleven(class_section):
        return None
    return SOCIAL_STUDIES_DAILY_PREFERRED_LIMIT


def has_social_studies_daily_spread_preference(class_section: ClassSection) -> bool:
    return social_studies_daily_preferred_limit(class_section) is not None
