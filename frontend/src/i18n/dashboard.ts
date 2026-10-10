import type { Language } from '../types/ticket'

export interface DashboardStrings {
  // Intake form
  welcome: string
  required: string
  name: string
  age: string
  gender: string
  female: string
  male: string
  preferNot: string
  notes: string
  setUp: string
  settingUp: string
  intakeFailed: string
  // Dashboard
  emergency: string
  ageYears: (n: number) => string
  emergencyAgain: string
  forYou: string
  more: string
  fewer: string
  requests: string
  openCount: (n: number) => string
  noOpen: string
  close: string
  startOver: string
  // Audio dashboard
  tapToTalk: string
  listening: string
  heard: string
  voiceUnavailable: string
}

/** Intake form and personalised dashboard. Kept apart from strings.ts (patient-UI track). */
export const DASHBOARD: Record<Language, DashboardStrings> = {
  en: {
    welcome: 'Welcome',
    required: 'Required',
    name: 'Your name',
    age: 'Your age',
    gender: 'Gender',
    female: 'Female',
    male: 'Male',
    preferNot: 'Prefer not to say',
    notes: 'Clinical notes',
    setUp: 'Set up my screen',
    settingUp: 'Setting up…',
    intakeFailed: 'That didn’t save. Please try again.',
    ageYears: (n) => `${n} years`,
    emergency: 'Emergency',
    emergencyAgain: 'Tap Emergency again to call your nurse.',
    forYou: 'For you',
    more: 'More requests',
    fewer: 'Show fewer',
    requests: 'Your requests',
    openCount: (n) => `${n} open ${n === 1 ? 'request' : 'requests'}`,
    noOpen: 'No open requests.',
    close: 'Close',
    startOver: 'Start over',
    tapToTalk: 'Tap and tell me what you need',
    listening: 'Listening…',
    heard: 'I heard:',
    voiceUnavailable: 'Voice isn’t available on this device. Please use the buttons below.',
  },
  es: {
    welcome: 'Bienvenido',
    required: 'Obligatorio',
    name: 'Su nombre',
    age: 'Su edad',
    gender: 'Género',
    female: 'Mujer',
    male: 'Hombre',
    preferNot: 'Prefiero no decirlo',
    notes: 'Notas clínicas',
    setUp: 'Preparar mi pantalla',
    settingUp: 'Preparando…',
    intakeFailed: 'No se guardó. Inténtelo de nuevo.',
    ageYears: (n) => `${n} años`,
    emergency: 'Emergencia',
    emergencyAgain: 'Toque Emergencia otra vez para llamar a su enfermera.',
    forYou: 'Para usted',
    more: 'Más pedidos',
    fewer: 'Mostrar menos',
    requests: 'Sus pedidos',
    openCount: (n) => `${n} ${n === 1 ? 'pedido abierto' : 'pedidos abiertos'}`,
    noOpen: 'No hay pedidos abiertos.',
    close: 'Cerrar',
    startOver: 'Empezar de nuevo',
    tapToTalk: 'Toque y dígame lo que necesita',
    listening: 'Escuchando…',
    heard: 'Escuché:',
    voiceUnavailable: 'La voz no está disponible en este dispositivo. Use los botones de abajo.',
  },
  hi: {
    welcome: 'स्वागत है',
    required: 'आवश्यक',
    name: 'आपका नाम',
    age: 'आपकी उम्र',
    gender: 'लिंग',
    female: 'महिला',
    male: 'पुरुष',
    preferNot: 'बताना नहीं चाहते',
    notes: 'क्लिनिकल नोट्स',
    setUp: 'मेरी स्क्रीन तैयार करें',
    settingUp: 'तैयार हो रही है…',
    intakeFailed: 'सेव नहीं हुआ। कृपया फिर से कोशिश करें।',
    ageYears: (n) => `${n} वर्ष`,
    emergency: 'आपातकाल',
    emergencyAgain: 'नर्स को बुलाने के लिए आपातकाल फिर से टैप करें।',
    forYou: 'आपके लिए',
    more: 'और अनुरोध',
    fewer: 'कम दिखाएँ',
    requests: 'आपके अनुरोध',
    openCount: (n) => `${n} खुले अनुरोध`,
    noOpen: 'कोई खुला अनुरोध नहीं।',
    close: 'बंद करें',
    startOver: 'फिर से शुरू करें',
    tapToTalk: 'टैप करें और बताएँ आपको क्या चाहिए',
    listening: 'सुन रहे हैं…',
    heard: 'मैंने सुना:',
    voiceUnavailable: 'इस डिवाइस पर आवाज़ उपलब्ध नहीं है। कृपया नीचे के बटन इस्तेमाल करें।',
  },
  gu: {
    welcome: 'સ્વાગત છે',
    required: 'જરૂરી',
    name: 'તમારું નામ',
    age: 'તમારી ઉંમર',
    gender: 'જાતિ',
    female: 'સ્ત્રી',
    male: 'પુરુષ',
    preferNot: 'જણાવવું નથી',
    notes: 'ક્લિનિકલ નોંધો',
    setUp: 'મારી સ્ક્રીન તૈયાર કરો',
    settingUp: 'તૈયાર થઈ રહી છે…',
    intakeFailed: 'સેવ ન થયું. કૃપા કરીને ફરી પ્રયાસ કરો.',
    ageYears: (n) => `${n} વર્ષ`,
    emergency: 'કટોકટી',
    emergencyAgain: 'નર્સને બોલાવવા માટે કટોકટી ફરીથી ટેપ કરો.',
    forYou: 'તમારા માટે',
    more: 'વધુ વિનંતીઓ',
    fewer: 'ઓછું બતાવો',
    requests: 'તમારી વિનંતીઓ',
    openCount: (n) => `${n} ખુલ્લી વિનંતીઓ`,
    noOpen: 'કોઈ ખુલ્લી વિનંતી નથી.',
    close: 'બંધ કરો',
    startOver: 'ફરીથી શરૂ કરો',
    tapToTalk: 'ટેપ કરો અને કહો તમારે શું જોઈએ છે',
    listening: 'સાંભળી રહ્યા છીએ…',
    heard: 'મેં સાંભળ્યું:',
    voiceUnavailable: 'આ ઉપકરણ પર અવાજ ઉપલબ્ધ નથી. કૃપા કરીને નીચેના બટન વાપરો.',
  },
  zh: {
    welcome: '欢迎',
    required: '必填',
    name: '您的姓名',
    age: '您的年龄',
    gender: '性别',
    female: '女',
    male: '男',
    preferNot: '不愿透露',
    notes: '临床记录',
    setUp: '设置我的屏幕',
    settingUp: '正在设置…',
    intakeFailed: '未能保存，请重试。',
    ageYears: (n) => `${n} 岁`,
    emergency: '紧急',
    emergencyAgain: '再次轻触“紧急”即可呼叫护士。',
    forYou: '为您推荐',
    more: '更多请求',
    fewer: '收起',
    requests: '您的请求',
    openCount: (n) => `${n} 个进行中的请求`,
    noOpen: '没有进行中的请求。',
    close: '关闭',
    startOver: '重新开始',
    tapToTalk: '轻触并告诉我您需要什么',
    listening: '正在聆听…',
    heard: '我听到：',
    voiceUnavailable: '此设备不支持语音。请使用下方的按钮。',
  },
  ht: {
    welcome: 'Byenvini',
    required: 'Obligatwa',
    name: 'Non ou',
    age: 'Laj ou',
    gender: 'Sèks',
    female: 'Fanm',
    male: 'Gason',
    preferNot: 'Mwen pa vle di',
    notes: 'Nòt klinik',
    setUp: 'Prepare ekran mwen',
    settingUp: 'N ap prepare…',
    intakeFailed: 'Li pa anrejistre. Tanpri eseye ankò.',
    ageYears: (n) => `${n} an`,
    emergency: 'Ijans',
    emergencyAgain: 'Touche Ijans ankò pou rele enfimyè w.',
    forYou: 'Pou ou',
    more: 'Plis demann',
    fewer: 'Montre mwens',
    requests: 'Demann ou yo',
    openCount: (n) => `${n} demann ouvè`,
    noOpen: 'Pa gen demann ouvè.',
    close: 'Fèmen',
    startOver: 'Rekòmanse',
    tapToTalk: 'Touche epi di m sa ou bezwen',
    listening: 'M ap koute…',
    heard: 'Mwen tande:',
    voiceUnavailable: 'Vwa pa disponib sou aparèy sa a. Tanpri sèvi ak bouton ki anba yo.',
  },
  pt: {
    welcome: 'Bem-vindo',
    required: 'Obrigatório',
    name: 'Seu nome',
    age: 'Sua idade',
    gender: 'Gênero',
    female: 'Feminino',
    male: 'Masculino',
    preferNot: 'Prefiro não dizer',
    notes: 'Notas clínicas',
    setUp: 'Preparar minha tela',
    settingUp: 'Preparando…',
    intakeFailed: 'Não foi salvo. Tente de novo.',
    ageYears: (n) => `${n} anos`,
    emergency: 'Emergência',
    emergencyAgain: 'Toque em Emergência de novo para chamar a enfermeira.',
    forYou: 'Para você',
    more: 'Mais pedidos',
    fewer: 'Mostrar menos',
    requests: 'Seus pedidos',
    openCount: (n) => `${n} ${n === 1 ? 'pedido aberto' : 'pedidos abertos'}`,
    noOpen: 'Nenhum pedido aberto.',
    close: 'Fechar',
    startOver: 'Recomeçar',
    tapToTalk: 'Toque e diga o que você precisa',
    listening: 'Ouvindo…',
    heard: 'Eu ouvi:',
    voiceUnavailable: 'A voz não está disponível neste aparelho. Use os botões abaixo.',
  },
}

/** Three synthetic test patients for the intake form (one tap fills it in). */
export const DEMO_PATIENTS = [
  {
    label: 'Rosa, 82 · low vision, bathroom often',
    name: 'Rosa',
    gender: 'female' as const,
    age: 82,
    clinical_notes:
      'Macular degeneration, poor eyesight. Uses the bathroom a lot at night (on furosemide). Unsteady on her feet.',
  },
  {
    label: 'Sam, 54 · post-op, nothing by mouth',
    name: 'Sam',
    gender: 'male' as const,
    age: 54,
    clinical_notes: 'Post-op day 1 after knee replacement. NPO for a second procedure tomorrow. Anxious about surgery.',
  },
  {
    label: 'Lena, 37 · feels cold, poor sleep',
    name: 'Lena',
    gender: 'female' as const,
    age: 37,
    clinical_notes: 'Recovering from pneumonia. Feels cold and has trouble sleeping. Mildly dehydrated.',
  },
] as const
