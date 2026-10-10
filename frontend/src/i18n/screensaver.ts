import type { Language } from '../types/ticket'

export interface ScreensaverStrings {
  label: string
  tapToContinue: string
  yourRequests: string
  tips: [string, string, string]
}

/** Kept apart from strings.ts so the patient-UI track can grow that file without conflicts. */
export const SCREENSAVER: Record<Language, ScreensaverStrings> = {
  en: {
    label: 'Screensaver',
    tapToContinue: 'Tap anywhere to continue',
    yourRequests: 'Your requests',
    tips: [
      'Tap the screen to ask for anything: water, a blanket, help with the TV.',
      'Please ask for help before getting out of bed.',
      'You can speak or type your request in your own language.',
    ],
  },
  es: {
    label: 'Protector de pantalla',
    tapToContinue: 'Toque en cualquier lugar para continuar',
    yourRequests: 'Sus pedidos',
    tips: [
      'Toque la pantalla para pedir lo que necesite: agua, una manta, ayuda con la TV.',
      'Por favor, pida ayuda antes de levantarse de la cama.',
      'Puede hablar o escribir su pedido en su propio idioma.',
    ],
  },
  hi: {
    label: 'स्क्रीनसेवर',
    tapToContinue: 'जारी रखने के लिए कहीं भी टैप करें',
    yourRequests: 'आपके अनुरोध',
    tips: [
      'कुछ भी माँगने के लिए स्क्रीन पर टैप करें: पानी, कंबल, टीवी में मदद।',
      'कृपया बिस्तर से उठने से पहले मदद माँगें।',
      'आप अपनी भाषा में बोलकर या लिखकर अनुरोध कर सकते हैं।',
    ],
  },
  gu: {
    label: 'સ્ક્રીનસેવર',
    tapToContinue: 'ચાલુ રાખવા માટે ક્યાંય પણ ટેપ કરો',
    yourRequests: 'તમારી વિનંતીઓ',
    tips: [
      'કંઈ પણ માંગવા માટે સ્ક્રીન પર ટેપ કરો: પાણી, ધાબળો, ટીવીમાં મદદ.',
      'કૃપા કરીને પથારીમાંથી ઊભા થતા પહેલા મદદ માંગો.',
      'તમે તમારી ભાષામાં બોલીને કે લખીને વિનંતી કરી શકો છો.',
    ],
  },
  zh: {
    label: '屏幕保护',
    tapToContinue: '轻触任意位置继续',
    yourRequests: '您的请求',
    tips: [
      '轻触屏幕即可提出任何需要：饮水、毯子、电视帮助。',
      '下床前请先寻求帮助。',
      '您可以用自己的语言说出或输入您的请求。',
    ],
  },
  ht: {
    label: 'Ekran repo',
    tapToContinue: 'Touche nenpòt kote pou kontinye',
    yourRequests: 'Demann ou yo',
    tips: [
      'Touche ekran an pou mande nenpòt bagay: dlo, yon lenn, èd ak televizyon an.',
      'Tanpri mande èd anvan ou leve sot nan kabann nan.',
      'Ou ka pale oswa ekri demann ou nan pwòp lang ou.',
    ],
  },
  pt: {
    label: 'Proteção de tela',
    tapToContinue: 'Toque em qualquer lugar para continuar',
    yourRequests: 'Seus pedidos',
    tips: [
      'Toque na tela para pedir o que precisar: água, um cobertor, ajuda com a TV.',
      'Por favor, peça ajuda antes de sair da cama.',
      'Você pode falar ou digitar seu pedido no seu próprio idioma.',
    ],
  },
}
