from enum import StrEnum


class Category(StrEnum):
    URGENT_CLINICAL = "URGENT_CLINICAL"
    NON_URGENT_CLINICAL = "NON_URGENT_CLINICAL"
    ENVIRONMENT_CLEANING = "ENVIRONMENT_CLEANING"
    COMFORT_SUPPLIES = "COMFORT_SUPPLIES"
    DIETARY = "DIETARY"
    TECH_AMENITIES = "TECH_AMENITIES"
    UNCLEAR = "UNCLEAR"


class Department(StrEnum):
    NURSING = "nursing"
    HOUSEKEEPING = "housekeeping"
    FOOD = "food"
    IT = "it"


class Priority(StrEnum):
    HIGH = "HIGH"
    NORMAL = "NORMAL"
    LOW = "LOW"


class Status(StrEnum):
    NEW = "NEW"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"
    ESCALATED = "ESCALATED"


class InputMode(StrEnum):
    TEXT = "text"
    VOICE = "voice"
    QUICK_TAP = "quick_tap"


class Language(StrEnum):
    EN = "en"
    ES = "es"
    HI = "hi"
    GU = "gu"
    ZH = "zh"
    HT = "ht"
    PT = "pt"


OPEN_STATUSES = frozenset({Status.NEW, Status.ACKNOWLEDGED, Status.IN_PROGRESS, Status.ESCALATED})
CLINICAL_CATEGORIES = frozenset(
    {Category.URGENT_CLINICAL, Category.NON_URGENT_CLINICAL, Category.UNCLEAR}
)
