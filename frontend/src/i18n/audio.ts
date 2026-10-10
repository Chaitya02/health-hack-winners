import type { Language } from '../types/ticket'

export interface AudioStrings {
  /** Group label for the two switches. */
  sound: string
  voice: string
  music: string
  on: string
  off: string
}

/** Spoken updates and waiting music (US-7). Kept apart from strings.ts like the tracker texts. */
export const AUDIO: Record<Language, AudioStrings> = {
  en: { sound: 'Sound', voice: 'Read updates aloud', music: 'Waiting music', on: 'On', off: 'Off' },
  es: { sound: 'Sonido', voice: 'Leer avisos en voz alta', music: 'Música de espera', on: 'Sí', off: 'No' },
  hi: { sound: 'आवाज़', voice: 'अपडेट बोलकर सुनाएँ', music: 'इंतज़ार का संगीत', on: 'चालू', off: 'बंद' },
  gu: { sound: 'અવાજ', voice: 'અપડેટ બોલીને સંભળાવો', music: 'રાહ જોતી વખતે સંગીત', on: 'ચાલુ', off: 'બંધ' },
  zh: { sound: '声音', voice: '朗读状态更新', music: '等候音乐', on: '开', off: '关' },
  ht: { sound: 'Son', voice: 'Li nouvèl yo fò', music: 'Mizik pandan w ap tann', on: 'Wi', off: 'Non' },
  pt: { sound: 'Som', voice: 'Ler avisos em voz alta', music: 'Música de espera', on: 'Ligado', off: 'Desligado' },
}
