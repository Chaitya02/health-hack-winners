import type { Category, Language } from '../types/ticket'

export interface TrackerStrings {
  progress: string
  eta: (minutes: number) => string
  soon: string
  /** Spoken with status updates: when someone will be with the patient. */
  arriving: (minutes: number) => string
  arrivingSoon: string
  stillWaiting: string
  nudged: string
  /** Shown and spoken when a response-time target is missed. */
  notice: Record<'still_looking' | 'taking_longer', string>
  cancel: string
  confirmCancel: string
  yesCancel: string
  keep: string
  nurseOnly: string
  failed: string
  earlier: string
  /** Card title for typed requests (never the patient's own words). */
  categories: Record<Category, string>
}

/** Request tracker (US-2 "Mirror"). Kept apart from strings.ts like the screensaver texts. */
export const TRACKER: Record<Language, TrackerStrings> = {
  en: {
    progress: 'Request progress',
    eta: (n) => `About ${n} min`,
    soon: 'Any minute now',
    arriving: (n) => n === 1 ? 'Someone will be with you in about 1 minute.' : `Someone will be with you in about ${n} minutes.`,
    arrivingSoon: 'Someone will be with you very soon.',
    stillWaiting: 'Still waiting?',
    nudged: 'We’ve reminded them.',
    notice: {
      still_looking: 'We’re still looking for someone to help you. You haven’t been forgotten.',
      taking_longer: 'This is taking longer than expected. We’re still on it.',
    },
    cancel: 'Cancel request',
    confirmCancel: 'Cancel this request?',
    yesCancel: 'Yes, cancel',
    keep: 'No, keep it',
    nurseOnly: 'Only your nurse can close this request.',
    failed: 'That didn’t work. Please try again.',
    earlier: 'Earlier today',
    categories: {
      URGENT_CLINICAL: 'Urgent help',
      NON_URGENT_CLINICAL: 'Care from your nurse',
      ENVIRONMENT_CLEANING: 'Room & cleaning',
      COMFORT_SUPPLIES: 'Comfort items',
      DIETARY: 'Food & drink',
      TECH_AMENITIES: 'TV & phone',
      UNCLEAR: 'Your request',
      EMOTIONAL_SUPPORT: 'Someone to talk to',
    },
  },
  es: {
    progress: 'Progreso del pedido',
    eta: (n) => `Unos ${n} min`,
    soon: 'En cualquier momento',
    arriving: (n) => n === 1 ? 'Alguien estará con usted en 1 minuto, más o menos.' : `Alguien estará con usted en unos ${n} minutos.`,
    arrivingSoon: 'Alguien estará con usted muy pronto.',
    stillWaiting: '¿Sigue esperando?',
    nudged: 'Les hemos avisado otra vez.',
    notice: {
      still_looking: 'Seguimos buscando a alguien para ayudarle. No nos hemos olvidado de usted.',
      taking_longer: 'Esto está tardando más de lo esperado. Seguimos en ello.',
    },
    cancel: 'Cancelar pedido',
    confirmCancel: '¿Cancelar este pedido?',
    yesCancel: 'Sí, cancelar',
    keep: 'No, mantenerlo',
    nurseOnly: 'Solo su enfermera puede cerrar este pedido.',
    failed: 'No funcionó. Inténtelo de nuevo.',
    earlier: 'Antes hoy',
    categories: {
      URGENT_CLINICAL: 'Ayuda urgente',
      NON_URGENT_CLINICAL: 'Atención de su enfermera',
      ENVIRONMENT_CLEANING: 'Habitación y limpieza',
      COMFORT_SUPPLIES: 'Artículos de comodidad',
      DIETARY: 'Comida y bebida',
      TECH_AMENITIES: 'TV y teléfono',
      UNCLEAR: 'Su pedido',
      EMOTIONAL_SUPPORT: 'Alguien con quien hablar',
    },
  },
  hi: {
    progress: 'अनुरोध की प्रगति',
    eta: (n) => `लगभग ${n} मिनट`,
    soon: 'बस आने ही वाले हैं',
    arriving: (n) => `लगभग ${n} मिनट में कोई आपके पास होगा।`,
    arrivingSoon: 'कोई बहुत जल्द आपके पास होगा।',
    stillWaiting: 'अभी भी इंतज़ार कर रहे हैं?',
    nudged: 'हमने उन्हें फिर से याद दिलाया है।',
    notice: {
      still_looking: 'हम अभी भी आपकी मदद के लिए किसी को ढूँढ रहे हैं। आपको भुलाया नहीं गया है।',
      taking_longer: 'इसमें उम्मीद से ज़्यादा समय लग रहा है। हम इस पर काम कर रहे हैं।',
    },
    cancel: 'अनुरोध रद्द करें',
    confirmCancel: 'क्या यह अनुरोध रद्द करें?',
    yesCancel: 'हाँ, रद्द करें',
    keep: 'नहीं, रहने दें',
    nurseOnly: 'यह अनुरोध केवल आपकी नर्स बंद कर सकती है।',
    failed: 'यह नहीं हो पाया। कृपया फिर से कोशिश करें।',
    earlier: 'आज पहले',
    categories: {
      URGENT_CLINICAL: 'तुरंत मदद',
      NON_URGENT_CLINICAL: 'नर्स से देखभाल',
      ENVIRONMENT_CLEANING: 'कमरा और सफ़ाई',
      COMFORT_SUPPLIES: 'आराम का सामान',
      DIETARY: 'खाना और पानी',
      TECH_AMENITIES: 'टीवी और फ़ोन',
      UNCLEAR: 'आपका अनुरोध',
      EMOTIONAL_SUPPORT: 'किसी से बात करना',
    },
  },
  gu: {
    progress: 'વિનંતીની પ્રગતિ',
    eta: (n) => `લગભગ ${n} મિનિટ`,
    soon: 'બસ હમણાં જ આવે છે',
    arriving: (n) => `લગભગ ${n} મિનિટમાં કોઈ તમારી પાસે હશે.`,
    arrivingSoon: 'કોઈ ખૂબ જલ્દી તમારી પાસે હશે.',
    stillWaiting: 'હજી રાહ જુઓ છો?',
    nudged: 'અમે તેમને ફરી યાદ અપાવ્યું છે.',
    notice: {
      still_looking: 'અમે હજી પણ તમારી મદદ માટે કોઈને શોધી રહ્યા છીએ. તમને ભૂલ્યા નથી.',
      taking_longer: 'આમાં ધાર્યા કરતાં વધુ સમય લાગી રહ્યો છે. અમે તેના પર કામ કરી રહ્યા છીએ.',
    },
    cancel: 'વિનંતી રદ કરો',
    confirmCancel: 'આ વિનંતી રદ કરવી છે?',
    yesCancel: 'હા, રદ કરો',
    keep: 'ના, રહેવા દો',
    nurseOnly: 'આ વિનંતી ફક્ત તમારી નર્સ બંધ કરી શકે છે.',
    failed: 'તે થયું નહીં. કૃપા કરીને ફરી પ્રયાસ કરો.',
    earlier: 'આજે અગાઉ',
    categories: {
      URGENT_CLINICAL: 'તાત્કાલિક મદદ',
      NON_URGENT_CLINICAL: 'નર્સ પાસેથી સંભાળ',
      ENVIRONMENT_CLEANING: 'રૂમ અને સફાઈ',
      COMFORT_SUPPLIES: 'આરામની વસ્તુઓ',
      DIETARY: 'ખાવાનું અને પીણું',
      TECH_AMENITIES: 'ટીવી અને ફોન',
      UNCLEAR: 'તમારી વિનંતી',
      EMOTIONAL_SUPPORT: 'કોઈની સાથે વાત',
    },
  },
  zh: {
    progress: '请求进度',
    eta: (n) => `约 ${n} 分钟`,
    soon: '马上就到',
    arriving: (n) => `大约 ${n} 分钟后会有人来。`,
    arrivingSoon: '马上会有人来。',
    stillWaiting: '还在等吗？',
    nudged: '我们已再次提醒他们。',
    notice: {
      still_looking: '我们仍在为您寻找帮助人员。我们没有忘记您。',
      taking_longer: '这比预期花的时间更长。我们仍在处理。',
    },
    cancel: '取消请求',
    confirmCancel: '要取消此请求吗？',
    yesCancel: '是，取消',
    keep: '不，保留',
    nurseOnly: '只有您的护士可以关闭此请求。',
    failed: '操作失败，请重试。',
    earlier: '今天早些时候',
    categories: {
      URGENT_CLINICAL: '紧急帮助',
      NON_URGENT_CLINICAL: '护士护理',
      ENVIRONMENT_CLEANING: '房间与清洁',
      COMFORT_SUPPLIES: '舒适用品',
      DIETARY: '饮食',
      TECH_AMENITIES: '电视和电话',
      UNCLEAR: '您的请求',
      EMOTIONAL_SUPPORT: '倾诉与陪伴',
    },
  },
  ht: {
    progress: 'Pwogrè demann nan',
    eta: (n) => `Anviwon ${n} min`,
    soon: 'Nenpòt ki lè kounye a',
    arriving: (n) => `Yon moun ap la nan anviwon ${n} minit.`,
    arrivingSoon: 'Yon moun ap la byento.',
    stillWaiting: 'W ap tann toujou?',
    nudged: 'Nou raple yo ankò.',
    notice: {
      still_looking: 'N ap toujou chèche yon moun pou ede ou. Nou pa bliye ou.',
      taking_longer: 'Sa a ap pran plis tan pase sa nou te panse. N ap toujou travay sou li.',
    },
    cancel: 'Anile demann nan',
    confirmCancel: 'Anile demann sa a?',
    yesCancel: 'Wi, anile',
    keep: 'Non, kenbe l',
    nurseOnly: 'Se sèlman enfimyè w ki ka fèmen demann sa a.',
    failed: 'Sa pa mache. Tanpri eseye ankò.',
    earlier: 'Pi bonè jodi a',
    categories: {
      URGENT_CLINICAL: 'Èd ijan',
      NON_URGENT_CLINICAL: 'Swen enfimyè w',
      ENVIRONMENT_CLEANING: 'Chanm ak netwayaj',
      COMFORT_SUPPLIES: 'Bagay pou konfò',
      DIETARY: 'Manje ak bwason',
      TECH_AMENITIES: 'Televizyon ak telefòn',
      UNCLEAR: 'Demann ou',
      EMOTIONAL_SUPPORT: 'Yon moun pou pale',
    },
  },
  pt: {
    progress: 'Andamento do pedido',
    eta: (n) => `Cerca de ${n} min`,
    soon: 'A qualquer momento',
    arriving: (n) => n === 1 ? 'Alguém estará com você em cerca de 1 minuto.' : `Alguém estará com você em cerca de ${n} minutos.`,
    arrivingSoon: 'Alguém estará com você muito em breve.',
    stillWaiting: 'Ainda esperando?',
    nudged: 'Já avisamos de novo.',
    notice: {
      still_looking: 'Ainda estamos procurando alguém para ajudar você. Não esquecemos de você.',
      taking_longer: 'Isto está demorando mais do que o esperado. Continuamos cuidando disso.',
    },
    cancel: 'Cancelar pedido',
    confirmCancel: 'Cancelar este pedido?',
    yesCancel: 'Sim, cancelar',
    keep: 'Não, manter',
    nurseOnly: 'Só sua enfermeira pode encerrar este pedido.',
    failed: 'Não deu certo. Tente de novo.',
    earlier: 'Mais cedo hoje',
    categories: {
      URGENT_CLINICAL: 'Ajuda urgente',
      NON_URGENT_CLINICAL: 'Cuidado da enfermeira',
      ENVIRONMENT_CLEANING: 'Quarto e limpeza',
      COMFORT_SUPPLIES: 'Itens de conforto',
      DIETARY: 'Comida e bebida',
      TECH_AMENITIES: 'TV e telefone',
      UNCLEAR: 'Seu pedido',
      EMOTIONAL_SUPPORT: 'Alguém para conversar',
    },
  },
}
