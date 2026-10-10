"""Multilingual clinical red-flag lexicon.

RED_FLAGS[reason][lang] = (patterns, example)
- patterns are regexes applied to normalize()d text (lowercase, Latin accents stripped,
  apostrophes removed). Latin-script patterns use word boundaries; Devanagari, Gujarati and
  Chinese patterns are plain substrings (no word boundaries in those scripts).
- example is a raw patient phrase that MUST trigger the reason (enforced by tests).

Design rule: the lexicon is deliberately broad. A false positive sends a request to the nurse
(safe); a false negative could leave a clinical need in a hospitality queue (unsafe). The few
exclusions (e.g. "pain medicine", "blood sugar", "fall asleep") only avoid HIGH-priority
alarm fatigue for requests the LLM still routes to the nurse anyway.
"""

Entry = tuple[list[str], str]

RED_FLAGS: dict[str, dict[str, Entry]] = {
    "pain": {
        "en": (
            [
                r"\bpain(?!\s*(med|medicine|medication|meds|pill|pills|killer|killers|relief|reliever)s?\b)",
                r"\bpainful\b",
                r"\bhurts?\b",
                r"\bhurting\b",
                r"\b(head|stomach|tummy|belly|back|ear|tooth)\s?aches?\b",
                r"\baching\b",
                r"\bthrob\w*",
                r"\bagony\b",
                r"\bcramp\w*",
                r"\b\d{1,2}\s*(/|out of)\s*10\b",
            ],
            "My surgical incision is throbbing",
        ),
        "es": ([r"\bdolor\w*", r"\bduele\w*", r"\bdoliendo\b"], "Me duele mucho el estómago"),
        "pt": ([r"\bdor\b", r"\bdores\b", r"\bdoendo\b", r"\bdoi\b"], "Estou com muita dor"),
        "ht": ([r"\bdoule\b", r"\bfe (m|mwen) mal\b", r"\bmal (anpil|pa)\b"], "Mwen gen doulè"),
        "hi": (["दर्द", "दुख रहा"], "मुझे बहुत दर्द है"),
        "gu": (["દુખાવો", "દુખે", "દર્દ"], "મને દુખાવો થાય છે"),
        "zh": (["痛", "疼"], "我肚子很疼"),
    },
    "bleeding": {
        "en": (
            [
                r"\bble+d\w*",
                r"\bbled\b",
                r"\bblood\w*(?!\s*(sugar|pressure|test|tests|work|draw|glucose|type)\b)",
                r"\bhemorrhag\w*",
            ],
            "I'm bleeding through my bandage",
        ),
        "es": ([r"\bsangr\w*", r"\bhemorragia\b"], "Estoy sangrando"),
        "pt": ([r"\bsangr\w*", r"\bhemorragia\b"], "Estou sangrando"),
        "ht": ([r"\bsenyen\b", r"\bsan ap koule\b"], "Mwen ap senyen"),
        "hi": (["खून", "रक्तस्राव"], "खून बह रहा है"),
        "gu": (["લોહી"], "લોહી નીકળે છે"),
        "zh": (["流血", "出血", "在流血", "有血"], "我的伤口在流血"),
    },
    "chest": {
        "en": ([r"\bchest\b(?!\s+of\s+drawers)", r"\bheart\s*attack"], "my chest feels tight"),
        "es": ([r"\bpecho\b"], "Me aprieta el pecho"),
        "pt": ([r"\bpeito\b"], "Aperto no peito"),
        "ht": ([r"\bpwatrin\b", r"\blestomak mwen sere\b"], "Pwatrin mwen sere"),
        "hi": (["सीने", "छाती"], "सीने में जकड़न है"),
        "gu": (["છાતી"], "છાતીમાં ભાર લાગે છે"),
        "zh": (["胸"], "我胸口闷"),
    },
    "breathing": {
        "en": (
            [
                r"\bbre+a?th\w*",
                r"\bshort of air\b",
                r"\bsuffocat\w*",
                r"\bchok\w*",
                r"\bwheez\w*",
                r"\bgasp\w*",
                r"\bthroat\s+(is\s+)?(closing|swelling|swollen|tight)",
            ],
            "I can't breathe",
        ),
        "es": ([r"\brespir\w*", r"\bfalta de aire\b", r"\bahog\w*"], "No puedo respirar"),
        "pt": ([r"\brespir\w*", r"\bfalta de ar\b", r"\bsufoc\w*"], "Não consigo respirar"),
        "ht": ([r"\brespire\b", r"\bsouf\b"], "Mwen pa ka pran souf"),
        "hi": (["सांस", "साँस", "दम घुट"], "सांस नहीं आ रही"),
        "gu": (["શ્વાસ"], "શ્વાસ લેવામાં તકલીફ"),
        "zh": (["呼吸", "喘", "透不过气", "憋气"], "我喘不过气"),
    },
    "dizziness": {
        "en": (
            [
                r"\bdiz+y\w*",
                r"\bdiz+i\w*",
                r"\blight\s*-?\s*headed\w*",
                r"\bvertigo\b",
                r"\b(room|everything)\s+(is\s+)?spinning\b",
            ],
            "I feel dizzy",
        ),
        "es": ([r"\bmare(ad[oa]s?|o|os)\b"], "Estoy mareada"),
        "pt": ([r"\btont[oa]s?\b", r"\btontura\b"], "Estou com tontura"),
        "ht": ([r"\btet (mwen )?(ap )?vire\b", r"\btet vire\b"], "Tèt mwen ap vire"),
        "hi": (["चक्कर"], "मुझे चक्कर आ रहा है"),
        "gu": (["ચક્કર"], "મને ચક્કર આવે છે"),
        "zh": (["头晕", "眩晕", "晕"], "我头晕"),
    },
    "fainting": {
        "en": (
            [
                r"\bfaint\w*",
                r"\bpass(ed|ing)?\s+out\b",
                r"\bblack(ed|ing)?\s+out\b",
                r"\bunconscious\b",
                r"\bunresponsive\b",
                r"\bnot\s+waking\s+up\b",
            ],
            "I feel like I'm going to faint",
        ),
        "es": ([r"\bdesmay\w*", r"\bperd\w* el conocimiento\b"], "Me voy a desmayar"),
        "pt": ([r"\bdesmai\w*", r"\bperd\w* os sentidos\b"], "Vou desmaiar"),
        "ht": ([r"\bendispoze\w*", r"\bpedi konesans\b"], "Mwen pral pèdi konesans"),
        "hi": (["बेहोश"], "मैं बेहोश होने वाला हूं"),
        "gu": (["બેભાન"], "હું બેભાન થઈ જઈશ"),
        "zh": (["昏倒", "晕倒", "昏迷", "失去知觉"], "我快要晕倒了"),
    },
    "fall": {
        "en": (
            [
                r"\bfell\b(?!\s+asleep)",
                r"\bfallen\b",
                r"\bfall(ing)?\s+(down|over)\b",
                r"\bfall(ing)?\s+out\s+of\s+(bed|my bed|the bed|chair|the chair)\b",
                r"\bslipped\b",
                r"\bhit\s+my\s+head\b",
                r"\bon\s+the\s+floor\s+and\s+(i\s+)?cant\s+get\s+up\b",
            ],
            "I fell in the bathroom",
        ),
        "es": ([r"\bme cai\b", r"\bcai\b", r"\bcaida\b", r"\bme he caido\b"], "Me caí"),
        "pt": ([r"\bcai\b", r"\bqueda\b", r"\bcaiu\b"], "Eu caí no banheiro"),
        "ht": ([r"\btonbe\b"], "Mwen tonbe nan twalèt la"),
        "hi": (["गिर"], "मैं गिर गया"),
        "gu": (["પડી ગ", "પડ્યો", "પડી"], "હું પડી ગયો"),
        "zh": (["摔倒", "跌倒", "摔了", "掉下床"], "我摔倒了"),
    },
    "confusion": {
        "en": (
            [
                r"\bconfus\w*",
                r"\bwhere am i\b",
                r"\bnot making sense\b",
                r"\bdisoriented\b",
                r"\bdoesnt know where\b",
            ],
            "I'm so confused",
        ),
        "es": (
            [r"\bconfundid[oa]s?\b", r"\bdesorientad[oa]s?\b", r"\bdonde estoy\b"],
            "Estoy confundido",
        ),
        "pt": ([r"\bconfus[oa]s?\b", r"\bonde estou\b"], "Estou confusa"),
        "ht": ([r"\bkonfize?\b", r"\bkonfi\b"], "Mwen konfize"),
        "hi": (["उलझन", "भ्रम", "कहाँ हूँ", "कहां हूं"], "मैं कहाँ हूँ"),
        "gu": (["મૂંઝવણ", "ગૂંચવણ", "ક્યાં છું"], "હું ક્યાં છું"),
        "zh": (["糊涂", "迷糊", "不知道在哪"], "我很糊涂"),
    },
    "fever": {
        "en": (
            [
                r"\bfever\w*",
                r"\bburning up\b",
                r"\bmy\s+temp(erature)?\s+(is\s+)?(high|\d)",
            ],
            "I have a fever",
        ),
        "es": ([r"\bfiebre\b", r"\bcalentura\b"], "Tengo fiebre"),
        "pt": ([r"\bfebre\b"], "Estou com febre"),
        "ht": ([r"\bla ?fyev\b", r"\bfyev\b"], "Mwen gen lafyèv"),
        "hi": (["बुखार"], "मुझे बुखार है"),
        "gu": (["તાવ"], "મને તાવ છે"),
        "zh": (["发烧", "发热"], "我发烧了"),
    },
    "chills": {
        "en": ([r"\bchills\b", r"\bshivering\b", r"\bshaking\b", r"\brigors?\b"], "I have chills"),
        "es": ([r"\bescalofrio\w*", r"\btemblando\b"], "Tengo escalofríos"),
        "pt": ([r"\bcalafrio\w*", r"\btremendo\b"], "Estou com calafrios"),
        "ht": ([r"\bfrison\b", r"\btranble\b"], "Mwen gen frison"),
        "hi": (["कंपकंपी", "ठंड लग"], "मुझे कंपकंपी हो रही है"),
        "gu": (["ધ્રુજારી", "ઠંડી લાગ"], "મને ધ્રુજારી આવે છે"),
        "zh": (["发冷", "寒战", "发抖"], "我在发抖"),
    },
    "nausea_vomiting": {
        "en": (
            [
                r"\bnause\w*",
                r"\bvomit\w*",
                r"\bthrow(ing)?\s*up\b",
                r"\bthrew\s+up\b",
                r"\bpuk\w*",
                r"\bfeel\w*\s+(really\s+|so\s+|very\s+)?sick\b",
                r"\bsick to my stomach\b",
                r"\bsick\b",
            ],
            "I've been throwing up",
        ),
        "es": ([r"\bnausea\w*", r"\bvomit\w*", r"\bganas de vomitar\b"], "Tengo náuseas"),
        "pt": ([r"\bnause\w*", r"\benjo\w*", r"\bvomit\w*"], "Estou vomitando"),
        "ht": ([r"\bvomi\w*", r"\bke m ap tounen\b"], "Mwen ap vomi"),
        "hi": (["उल्टी", "जी मिचला", "मतली"], "मुझे उल्टी आ रही है"),
        "gu": (["ઉલટી", "ઊબકા"], "મને ઉલટી થાય છે"),
        "zh": (["恶心", "呕吐", "想吐"], "我想吐"),
    },
    "wound": {
        "en": (
            [
                r"\bincision\w*",
                r"\bwounds?\b(?!\s+up)",
                r"\bstitch\w*",
                r"\bstaples?\b",
                r"\bsurgical\s+site\b",
                r"\bdressing\s+(is\s+)?(wet|soaked|bloody|off)\b",
                r"\boozing\b",
                r"\bpus\b",
            ],
            "my wound is leaking",
        ),
        "es": (
            [
                r"\bherida\w*",
                r"\bincision\w*",
                r"\bpuntos de (la )?(herida|cirugia|operacion)\b",
                r"\bgrapas\b",
            ],
            "Mi herida está abierta",
        ),
        "pt": (
            [
                r"\bferida\w*",
                r"\bincisao\b",
                r"\bpontos (da cirurgia|abriram|soltaram)\b",
                r"\bcorte da cirurgia\b",
            ],
            "Minha ferida abriu",
        ),
        "ht": ([r"\bblesi\b", r"\bple\b", r"\bkoud (yo|operasyon)\b"], "Blesi mwen louvri"),
        "hi": (["घाव", "टांके", "टाँके", "चीरा"], "मेरे टांके खुल गए"),
        "gu": (["ઘાવ", "ટાંકા", "ચીરો"], "મારા ટાંકા ખૂલી ગયા"),
        "zh": (["伤口", "切口", "缝线", "缝针"], "伤口裂开了"),
    },
    "swelling": {
        "en": ([r"\bswell\w*", r"\bswollen\b", r"\bpuffy\b"], "my leg is swollen"),
        "es": (
            [r"\bhinchad[oa]s?\b", r"\bhinchazon\b", r"\binflamad[oa]s?\b"],
            "Tengo la pierna hinchada",
        ),
        "pt": ([r"\binchad[oa]s?\b", r"\binchaco\b"], "Minha perna está inchada"),
        "ht": ([r"\banfle\b"], "Pye m anfle"),
        "hi": (["सूजन", "सूज"], "पैर में सूजन है"),
        "gu": (["સોજો"], "પગમાં સોજો છે"),
        "zh": (["肿"], "我的腿肿了"),
    },
    "allergic_reaction": {
        "en": (
            [r"\ballerg\w*", r"\bhives\b", r"\banaphyla\w*", r"\brash\b", r"\bitchy all over\b"],
            "I think I'm having an allergic reaction",
        ),
        "es": ([r"\balergi\w*", r"\bronchas\b"], "Tengo una reacción alérgica"),
        "pt": ([r"\balergi\w*", r"\burticaria\b"], "Estou tendo uma alergia"),
        "ht": ([r"\baleji\w*", r"\balerji\w*"], "Mwen fè yon alèji"),
        "hi": (["एलर्जी"], "मुझे एलर्जी हो रही है"),
        "gu": (["એલર્જી"], "મને એલર્જી થઈ છે"),
        "zh": (["过敏"], "我过敏了"),
    },
    "numbness": {
        "en": (
            [
                r"\bnumb\w*",
                r"\btingl\w*",
                r"\b(cant|cannot)\s+feel\s+my\b",
                r"\bpins and needles\b",
            ],
            "my arm is numb",
        ),
        "es": (
            [
                r"\bentumecid[oa]s?\b",
                r"\badormecid[oa]s?\b",
                r"\bno siento (mi|mis|el|la|los|las)\b",
            ],
            "No siento mis piernas",
        ),
        "pt": (
            [
                r"\bdormente\w*",
                r"\bdormencia\b",
                r"\bnao sinto (o|a|os|as|meu|minha|meus|minhas)\b",
            ],
            "Minha mão está dormente",
        ),
        "ht": ([r"\bpa santi\b", r"\bangoudi\b"], "Mwen pa santi janm mwen"),
        "hi": (["सुन्न"], "मेरा हाथ सुन्न है"),
        "gu": (["સુન્ન", "ખાલી ચડી"], "મારો હાથ સુન્ન છે"),
        "zh": (["麻木", "发麻"], "我的手发麻"),
    },
    "vision": {
        "en": (
            [r"\bblurr\w*", r"\b(cant|cannot)\s+see\b", r"\bvision\b", r"\bgoing\s+blind\b"],
            "everything is blurry",
        ),
        "es": ([r"\bborros\w*", r"\bno veo\b", r"\bvision\b"], "Veo todo borroso"),
        "pt": ([r"\bembacad\w*", r"\bnao enxergo\b", r"\bvisao\b"], "Minha visão está embaçada"),
        "ht": ([r"\bje (m|mwen) twoub\b", r"\bpa ka we\b"], "Je m twoub"),
        "hi": (["धुंधला", "दिखाई नहीं"], "सब धुंधला दिख रहा है"),
        "gu": (["ઝાંખું", "દેખાતું નથી"], "બધું ઝાંખું દેખાય છે"),
        "zh": (["看不清", "模糊", "视力"], "我看不清楚"),
    },
    "self_harm": {
        "en": (
            [
                r"\bkill\s+myself\b",
                r"\bsuicid\w*",
                r"\b(dont|do not)\s+want\s+to\s+(live|be alive|wake up)\b",
                r"\bend\s+(my|it)\s+(life|all)\b",
                r"\bhurt\s+myself\b",
                r"\bwant\s+to\s+die\b",
                r"\bself[\s-]?harm\w*",
            ],
            "I don't want to live anymore",
        ),
        "es": (
            [r"\bsuicid\w*", r"\bmatarme\b", r"\bno quiero vivir\b", r"\bquiero morir\b"],
            "No quiero vivir",
        ),
        "pt": (
            [r"\bsuicid\w*", r"\bme matar\b", r"\bnao quero viver\b", r"\bquero morrer\b"],
            "Não quero viver",
        ),
        "ht": ([r"\btouye tet (m|mwen)\b", r"\bpa vle viv\b"], "Mwen pa vle viv ankò"),
        "hi": (["आत्महत्या", "जीना नहीं", "मरना चाहत"], "मैं जीना नहीं चाहता"),
        "gu": (["આત્મહત્યા", "જીવવું નથી"], "મારે જીવવું નથી"),
        "zh": (["自杀", "不想活"], "我不想活了"),
    },
    "help_emergency": {
        "en": (
            [
                r"^\W*(please\s+)?help(\s+me)?(\s+please)?\W*$",
                r"\bhelp\s*!",
                r"\bplease\s+help\b",
                r"\b(somebody|someone|anybody|anyone)\s+help(\s+me)?\s*(!|please|now|quick|\W*$)",
                r"\bemergency\b",
                r"\bnurse\s+(now|asap|right now|immediately|quick)\b",
                r"\bcall\s+(a\s+)?(doctor|911|code)\b",
                r"\burgent\w*",
                r"\bsos\b",
                r"\bdying\b",
            ],
            "HELP PLEASE",
        ),
        "es": (
            [
                r"^\W*(por favor\s+)?ayuda(me)?(\s+por favor)?\W*$",
                r"\bayudenme\b",
                r"\bauxilio\b",
                r"\bsocorro\b",
                r"\bemergencia\b",
                r"\burgente\b",
            ],
            "¡Auxilio!",
        ),
        "pt": (
            [
                r"^\W*(por favor\s+)?ajuda(\s+por favor)?\W*$",
                r"\bme ajudem\b",
                r"\bsocorro\b",
                r"\bemergencia\b",
                r"\burgente\b",
            ],
            "Socorro!",
        ),
        "ht": ([r"\banmwe\b", r"\bijans\b", r"\bede (m|mwen) vit\b"], "Anmwe!"),
        "hi": (["बचाओ", "मदद करो", "इमरजेंसी", "आपातकाल"], "बचाओ"),
        "gu": (["બચાવો", "મદદ કરો", "ઇમરજન્સી"], "બચાવો"),
        "zh": (["救命", "紧急", "急救", "快来人"], "救命"),
    },
    "cardiac": {
        "en": (
            [
                r"\bheart\s+(is\s+)?(racing|pounding|fluttering|skipping)\b",
                r"\bpalpitation\w*",
                r"\bheart\s*attack\b",
            ],
            "my heart is racing",
        ),
        "es": (
            [
                r"\bcorazon\s+(me\s+)?(late|acelerado|palpita)\w*",
                r"\bpalpitacion\w*",
                r"\btaquicardia\b",
            ],
            "Tengo palpitaciones",
        ),
        "pt": (
            [
                r"\bcoracao\s+(esta\s+)?(acelerado|disparado)\b",
                r"\bpalpitac\w*",
                r"\btaquicardia\b",
            ],
            "Meu coração está acelerado",
        ),
        "ht": ([r"\bke (m|mwen) ap bat (fo|vit)\b"], "Kè m ap bat fò"),
        "hi": (["धड़कन", "दिल तेज"], "दिल की धड़कन तेज है"),
        "gu": (["ધબકારા"], "ધબકારા વધી ગયા છે"),
        "zh": (["心跳很快", "心慌", "心悸"], "我心慌"),
    },
    "neuro": {
        "en": (
            [
                r"\bseizure\w*",
                r"\bconvuls\w*",
                r"\bstroke\b",
                r"\bdroop\w*",
                r"\bslurr\w*",
                r"\b(cant|cannot)\s+(move|lift)\s+my\s+(arm|leg|hand|face)\b",
            ],
            "his face looks droopy",
        ),
        "es": ([r"\bconvulsi\w*", r"\bderrame\b", r"\bataque\b"], "Está teniendo una convulsión"),
        "pt": ([r"\bconvuls\w*", r"\bderrame\b", r"\bavc\b"], "Acho que é um derrame"),
        "ht": ([r"\bkriz\b", r"\bkonvilsyon\b"], "Li gen yon kriz"),
        "hi": (["दौरा", "लकवा"], "उसे दौरा पड़ा है"),
        "gu": (["આંચકી", "લકવો"], "તેને આંચકી આવે છે"),
        "zh": (["抽搐", "中风", "癫痫"], "他在抽搐"),
    },
}

LANGUAGES = ("en", "es", "pt", "ht", "hi", "gu", "zh")
