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


# Extra lines when a patient-profile rule changed the request (US-5). Templated, like the rest.
_PROFILE_NOTES: dict[Language, dict[str, str]] = {
    Language.EN: {
        "npo": "You can't eat or drink right now, so your nurse will check with you first.",
        "fall_risk": "Because of your fall risk this is a priority. Please stay in bed until help arrives.",
        "npo_tile": "You can't eat or drink right now. Ask your nurse if you have questions.",
    },
    Language.ES: {
        "npo": "Ahora no puede comer ni beber, así que su enfermera hablará con usted primero.",
        "fall_risk": "Por su riesgo de caída, esto es una prioridad. Quédese en la cama hasta que llegue la ayuda.",
        "npo_tile": "Ahora no puede comer ni beber. Pregunte a su enfermera si tiene dudas.",
    },
    Language.HI: {
        "npo": "अभी आप कुछ खा या पी नहीं सकते, इसलिए आपकी नर्स पहले आपसे बात करेगी।",
        "fall_risk": "गिरने के खतरे के कारण यह प्राथमिकता है। कृपया मदद आने तक बिस्तर पर ही रहें।",
        "npo_tile": "अभी आप कुछ खा या पी नहीं सकते। कोई सवाल हो तो अपनी नर्स से पूछें।",
    },
    Language.GU: {
        "npo": "હમણાં તમે કંઈ ખાઈ કે પી શકતા નથી, તેથી તમારી નર્સ પહેલા તમારી સાથે વાત કરશે.",
        "fall_risk": "પડી જવાના જોખમને કારણે આ પ્રાથમિકતા છે. મદદ આવે ત્યાં સુધી કૃપા કરીને પથારીમાં જ રહો.",
        "npo_tile": "હમણાં તમે કંઈ ખાઈ કે પી શકતા નથી. કોઈ પ્રશ્ન હોય તો તમારી નર્સને પૂછો.",
    },
    Language.ZH: {
        "npo": "您现在不能进食或喝水，护士会先来和您确认。",
        "fall_risk": "由于您有跌倒风险，此请求已设为优先。请在床上等待，直到有人来帮助您。",
        "npo_tile": "您现在不能进食或喝水。如有疑问，请询问您的护士。",
    },
    Language.HT: {
        "npo": "Ou pa ka manje ni bwè kounye a, kidonk enfimyè w ap tcheke avè w anvan.",
        "fall_risk": "Paske ou riske tonbe, sa a se yon priyorite. Tanpri rete nan kabann nan jiskaske èd rive.",
        "npo_tile": "Ou pa ka manje ni bwè kounye a. Mande enfimyè w si ou gen kesyon.",
    },
    Language.PT: {
        "npo": "Você não pode comer nem beber agora, então sua enfermeira vai falar com você primeiro.",
        "fall_risk": "Por causa do seu risco de queda, isto é prioridade. Fique na cama até a ajuda chegar.",
        "npo_tile": "Você não pode comer nem beber agora. Pergunte à sua enfermeira se tiver dúvidas.",
    },
}


def profile_note(language: Language, flag: str) -> str:
    return _PROFILE_NOTES.get(language, _PROFILE_NOTES[Language.EN])[flag]
