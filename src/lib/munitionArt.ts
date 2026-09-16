export const MUNITION_ARTEN = ['Übungsmunition', 'Einsatzmunition'] as const
export type MunitionArt = (typeof MUNITION_ARTEN)[number]

export const MUNITION_WAFFEN = ['Pistole', 'Sturmgewehr', 'Sonstige'] as const
export type MunitionWaffe = (typeof MUNITION_WAFFEN)[number]

export function isMunitionArt(value: string): value is MunitionArt {
  return (MUNITION_ARTEN as readonly string[]).includes(value)
}

export function isMunitionWaffe(value: string): value is MunitionWaffe {
  return (MUNITION_WAFFEN as readonly string[]).includes(value)
}
