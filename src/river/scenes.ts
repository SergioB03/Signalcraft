/**
 * Scene definitions for the river canvas.
 *
 * Everything visual derives from `severity` (0–1): wave amplitude, water
 * speed, cloud cover, rain, and avatar bobbing all read the same scalar,
 * which is what makes the scene feel like one connected system. Colors are
 * absolute (a storm is dark in either UI theme); the page chrome themes
 * around the river, not the river itself.
 */

export type SceneName =
  | 'gathering'
  | 'clear'
  | 'breezy'
  | 'overcast'
  | 'rough'
  | 'storm'

export type SceneSpec = {
  severity: number
  skyTop: string
  skyBottom: string
  water: string
  waterDeep: string
  sun: number // 0-1 how present the sun is
  clouds: number // 0-1 cloud cover
  rain: number // 0-1 rain density
  lightning: boolean
  caption: string
}

export const SCENES: Record<SceneName, SceneSpec> = {
  gathering: {
    severity: 0.15,
    skyTop: '#8d9aa6',
    skyBottom: '#c2cad1',
    water: '#6a7b85',
    waterDeep: '#4a5a64',
    sun: 0,
    clouds: 0.35,
    rain: 0,
    lightning: false,
    caption: 'waiting for the team',
  },
  clear: {
    severity: 0.06,
    skyTop: '#6fa8d0',
    skyBottom: '#d8ecf6',
    water: '#4e86a0',
    waterDeep: '#35637a',
    sun: 1,
    clouds: 0.05,
    rain: 0,
    lightning: false,
    caption: 'glassy and slow',
  },
  breezy: {
    severity: 0.3,
    skyTop: '#79a8c4',
    skyBottom: '#cfe2ec',
    water: '#4b8390',
    waterDeep: '#326070',
    sun: 0.7,
    clouds: 0.3,
    rain: 0,
    lightning: false,
    caption: 'bright but moving',
  },
  overcast: {
    severity: 0.55,
    skyTop: '#67727c',
    skyBottom: '#9aa3ab',
    water: '#49565e',
    waterDeep: '#333e46',
    sun: 0,
    clouds: 0.75,
    rain: 0.15,
    lightning: false,
    caption: 'grey and choppy',
  },
  rough: {
    severity: 0.8,
    skyTop: '#3c4550',
    skyBottom: '#5c6670',
    water: '#2e3a44',
    waterDeep: '#1e262e',
    sun: 0,
    clouds: 0.9,
    rain: 0.55,
    lightning: false,
    caption: 'rapids and whitecaps',
  },
  storm: {
    severity: 1,
    skyTop: '#171c22',
    skyBottom: '#2c343d',
    water: '#141a20',
    waterDeep: '#0b0f13',
    sun: 0,
    clouds: 1,
    rain: 1,
    lightning: true,
    caption: 'hold on',
  },
}

export type AvatarPose =
  | 'floating'
  | 'raft'
  | 'underwater'
  | 'struck'
  | 'coconut'
  | 'waving'

export type RiverMember = {
  id: string
  displayName: string
  pose: AvatarPose
  isMe: boolean
}

// --- tiny color math for tweening ----------------------------------------

export type Rgb = [number, number, number]

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function lerpRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

export function rgbCss([r, g, b]: Rgb, alpha = 1): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`
}