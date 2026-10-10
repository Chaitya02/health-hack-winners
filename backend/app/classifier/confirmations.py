"""Templated patient confirmations in 7 languages.

The patient-facing text is templated, not LLM-generated, so a prompt-injection attempt can never
make the bedside screen display arbitrary text. The LLM's own confirmation is kept in the audit.
"""

from collections.abc import Iterable

from app.models import Department, Language

_TEMPLATES: dict[Language, dict[str, str]] = {
    Language.EN: {
        "urgent": "Your nurse has been alerted and is coming now.",
        Department.NURSING: "Your nurse has been notified.",
        Department.HOUSEKEEPING: "Housekeeping is on the way.",
        Department.FOOD: "Food Services is on the way.",
        Department.IT: "The Unit Clerk / IT team has been notified.",
    },
    Language.ES: {
        "urgent": "Su enfermera ha sido alertada y viene ahora.",
        Department.NURSING: "Su enfermera ha sido notificada.",
        Department.HOUSEKEEPING: "Limpieza va en camino.",
        Department.FOOD: "Servicios de alimentación va en camino.",
        Department.IT: "El equipo de recepción / TI ha sido notificado.",
    },
    Language.HI: {
        "urgent": "आपकी नर्स को सूचित कर दिया गया है और वह अभी आ रही है।",
        Department.NURSING: "आपकी नर्स को सूचित कर दिया गया है।",
        Department.HOUSEKEEPING: "हाउसकीपिंग टीम आ रही है।",
        Department.FOOD: "भोजन सेवा टीम आ रही है।",
        Department.IT: "यूनिट क्लर्क / आईटी टीम को सूचित कर दिया गया है।",
    },
    Language.GU: {
        "urgent": "તમારી નર્સને જાણ કરવામાં આવી છે અને તે હમણાં આવી રહી છે.",
        Department.NURSING: "તમારી નર્સને જાણ કરવામાં આવી છે.",
        Department.HOUSEKEEPING: "હાઉસકીપિંગ ટીમ આવી રહી છે.",
        Department.FOOD: "ભોજન સેવા ટીમ આવી રહી છે.",
        Department.IT: "યુનિટ ક્લાર્ક / આઈટી ટીમને જાણ કરવામાં આવી છે.",
    },
    Language.ZH: {
        "urgent": "已通知您的护士，护士马上就到。",
        Department.NURSING: "已通知您的护士。",
        Department.HOUSEKEEPING: "保洁人员正在赶来。",
        Department.FOOD: "餐饮服务人员正在赶来。",
        Department.IT: "已通知病区文员 / IT 团队。",
    },
    Language.HT: {
        "urgent": "Nou avèti enfimyè ou a, l ap vini kounye a.",
        Department.NURSING: "Nou avèti enfimyè ou a.",
        Department.HOUSEKEEPING: "Ekip menaj la ap vini.",
        Department.FOOD: "Sèvis manje a ap vini.",
        Department.IT: "Nou avèti ekip resepsyon / IT la.",
    },
    Language.PT: {
        "urgent": "Sua enfermeira foi alertada e está vindo agora.",
        Department.NURSING: "Sua enfermeira foi avisada.",
        Department.HOUSEKEEPING: "A equipe de limpeza está a caminho.",
        Department.FOOD: "O Serviço de Nutrição está a caminho.",
        Department.IT: "A equipe de recepção / TI foi avisada.",
    },
}

_ORDER = [Department.NURSING, Department.HOUSEKEEPING, Department.FOOD, Department.IT]


def confirmation_for(language: Language, departments: Iterable[Department], urgent: bool) -> str:
    t = _TEMPLATES.get(language, _TEMPLATES[Language.EN])
    depts = set(departments)
    parts = []
    for d in _ORDER:
        if d in depts:
            parts.append(t["urgent"] if d == Department.NURSING and urgent else t[d])
    return " ".join(parts) or t[Department.NURSING]
