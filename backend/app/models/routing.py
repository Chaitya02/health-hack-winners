"""Single source of truth for category → department/priority routing."""

from app.models.enums import Category, Department, Priority

ROUTING: dict[Category, tuple[Department, Priority]] = {
    Category.URGENT_CLINICAL: (Department.NURSING, Priority.HIGH),
    Category.NON_URGENT_CLINICAL: (Department.NURSING, Priority.NORMAL),
    Category.UNCLEAR: (Department.NURSING, Priority.NORMAL),
    Category.ENVIRONMENT_CLEANING: (Department.HOUSEKEEPING, Priority.NORMAL),
    Category.COMFORT_SUPPLIES: (Department.HOUSEKEEPING, Priority.NORMAL),
    Category.DIETARY: (Department.FOOD, Priority.NORMAL),
    Category.TECH_AMENITIES: (Department.IT, Priority.LOW),
}

DEPARTMENT_LABELS: dict[Department, str] = {
    Department.NURSING: "Primary Nurse",
    Department.HOUSEKEEPING: "Housekeeping & Facilities",
    Department.FOOD: "Food Services",
    Department.IT: "Unit Clerk / IT",
}


def route(category: Category) -> tuple[Department, Priority]:
    return ROUTING[category]
