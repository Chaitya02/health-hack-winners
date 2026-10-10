"""Single source of truth for category → department/priority routing."""

from app.models.enums import Category, Department, Priority, Role

ROUTING: dict[Category, tuple[Department, Priority]] = {
    Category.URGENT_CLINICAL: (Department.NURSING, Priority.HIGH),
    Category.NON_URGENT_CLINICAL: (Department.NURSING, Priority.NORMAL),
    Category.UNCLEAR: (Department.NURSING, Priority.NORMAL),
    Category.ENVIRONMENT_CLEANING: (Department.HOUSEKEEPING, Priority.NORMAL),
    Category.COMFORT_SUPPLIES: (Department.HOUSEKEEPING, Priority.NORMAL),
    Category.DIETARY: (Department.FOOD, Priority.NORMAL),
    Category.TECH_AMENITIES: (Department.IT, Priority.LOW),
    # Routed to the nurse until we decide on a dedicated support team (chaplain / social work).
    Category.EMOTIONAL_SUPPORT: (Department.NURSING, Priority.NORMAL),
}

# Severity orders requests inside one department's queue: 5 = most severe, 1 = least.
SEVERITY: dict[Category, int] = {
    Category.URGENT_CLINICAL: 5,
    Category.NON_URGENT_CLINICAL: 3,
    Category.UNCLEAR: 3,
    Category.EMOTIONAL_SUPPORT: 3,
    Category.ENVIRONMENT_CLEANING: 2,
    Category.COMFORT_SUPPLIES: 2,
    Category.DIETARY: 2,
    Category.TECH_AMENITIES: 1,
}

# Each staff role works one department's queue. Admin has no queue; patient/system never log in.
STAFF_ROLE: dict[Department, Role] = {
    Department.NURSING: Role.NURSE,
    Department.HOUSEKEEPING: Role.HOUSEKEEPING,
    Department.FOOD: Role.FOOD,
    Department.IT: Role.IT,
}
ROLE_DEPARTMENT: dict[Role, Department] = {r: d for d, r in STAFF_ROLE.items()}
LOGIN_ROLES = frozenset({*ROLE_DEPARTMENT, Role.ADMIN})

DEPARTMENT_LABELS: dict[Department, str] = {
    Department.NURSING: "Primary Nurse",
    Department.HOUSEKEEPING: "Housekeeping & Facilities",
    Department.FOOD: "Food Services",
    Department.IT: "Unit Clerk / IT",
}


def route(category: Category) -> tuple[Department, Priority]:
    return ROUTING[category]


def default_severity(category: Category) -> int:
    return SEVERITY[category]
