/**
 * Scene definitions for the river canvas.
 *
 * Everything visual derives from `severity` (0–1): flow speed, chop, cloud
 * cover, rain, lightning, how far the greens drain out of the banks, and how
 * hard the avatars bob. One scalar, one connected landscape. Colors are
 * absolute (a storm is dark in either UI theme); the page chrome themes around
 * the river, not the river itself.
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
  bank: string // grass / ground on either side of the stream
  foliage: string // reeds, canopies
  hill: string // distant hills at the horizon
  earth: string // the cut bank at the water's edge
  flowers: number // 0-1 wildflower density on the banks
  sun: number // 0-1 how present the sun is
  clouds: number // 0-1 cloud cover
  rain: number // 0-1 rain density
  lightning: boolean
  caption: string
}

/** Each member gets a stable personal color from their id — same on every screen. */
export const MEMBER_COLORS = [
  '#e8c87e', // sun
  '#d98c6b', // coral
  '#6fb1c9', // sky
  '#8fae7a', // moss
  '#a99ac9', // lavender
  '#e6a7a7', // rose
  '#c9b07a', // sand
  '#7fc4b5', // mint
]
const HAIR_COLORS = ['#3b2a20', '#6b4a2e', '#b5803f', '#2b2b2b', '#8a6b5a', '#d9b38c']

function hashId(id: string): number {
  let h = 7
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h
}
export const memberColor = (id: string) => MEMBER_COLORS[hashId(id) % MEMBER_COLORS.length]
export const memberHair = (id: string) => HAIR_COLORS[(hashId(id) >>> 3) % HAIR_COLORS.length]

export const SCENE_ORDER: SceneName[] = [
  'gathering',
  'clear',
  'breezy',
  'overcast',
  'rough',
  'storm',
]

export const SCENES: Record<SceneName, SceneSpec> = {
  gathering: {
    severity: 0.15,
    skyTop: '#8d9aa6',
    skyBottom: '#c8cfd4',
    water: '#6f8089',
    waterDeep: '#4c5b64',
    bank: '#73816f',
    foliage: '#5f7266',
    hill: '#7e8b86',
    earth: '#8a7a62',
    flowers: 0.2,
    sun: 0,
    clouds: 0.35,
    rain: 0,
    lightning: false,
    caption: 'waiting for the team',
  },
  clear: {
    severity: 0.06,
    skyTop: '#66a6d4',
    skyBottom: '#e4f0f7',
    water: '#4a93b0',
    waterDeep: '#2b6684',
    bank: '#86a86c',
    foliage: '#5a8a66',
    hill: '#6f9a84',
    earth: '#b38b5a',
    flowers: 1,
    sun: 1,
    clouds: 0.08,
    rain: 0,
    lightning: false,
    caption: 'glassy and slow',
  },
  breezy: {
    severity: 0.3,
    skyTop: '#74a6c6',
    skyBottom: '#d6e6ee',
    water: '#478a9a',
    waterDeep: '#2a6070',
    bank: '#7d9c6a',
    foliage: '#557b64',
    hill: '#6a8c7c',
    earth: '#a8865e',
    flowers: 0.7,
    sun: 0.7,
    clouds: 0.3,
    rain: 0,
    lightning: false,
    caption: 'bright but moving',
  },
  overcast: {
    severity: 0.55,
    skyTop: '#67727c',
    skyBottom: '#a0a8ae',
    water: '#4a5962',
    waterDeep: '#2f3a42',
    bank: '#68766a',
    foliage: '#4f6157',
    hill: '#5f6c6a',
    earth: '#7d7160',
    flowers: 0.25,
    sun: 0,
    clouds: 0.75,
    rain: 0.15,
    lightning: false,
    caption: 'grey and choppy',
  },
  rough: {
    severity: 0.8,
    skyTop: '#3b444e',
    skyBottom: '#5e6870',
    water: '#2c3943',
    waterDeep: '#18212a',
    bank: '#4a554c',
    foliage: '#36443c',
    hill: '#414c4d',
    earth: '#5a5449',
    flowers: 0.05,
    sun: 0,
    clouds: 0.9,
    rain: 0.55,
    lightning: false,
    caption: 'rapids and whitecaps',
  },
  storm: {
    severity: 1,
    skyTop: '#151a20',
    skyBottom: '#2b333c',
    water: '#131920',
    waterDeep: '#090d11',
    bank: '#2c332f',
    foliage: '#1f2824',
    hill: '#262e35',
    earth: '#3a3835',
    flowers: 0,
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

/** Discrete named places on the river — chosen, never free-roamed. */
export type Spot = 'drift' | 'headwater' | 'rapids' | 'rock' | 'shade' | 'shallows' | 'eddy'

export const SPOTS: Array<{ spot: Spot; label: string; hint: string }> = [
  { spot: 'drift', label: 'drifting', hint: 'wherever the current puts you' },
  { spot: 'headwater', label: 'the headwater', hint: 'upstream, where it all starts' },
  { spot: 'rapids', label: 'the rapids', hint: 'the fast stretch between the drops' },
  { spot: 'rock', label: 'on the big rock', hint: 'dry, mostly' },
  { spot: 'shade', label: 'in the shade', hint: 'under the old tree on the bank' },
  { spot: 'shallows', label: 'the shallows', hint: 'ankle-deep at the near bank' },
  { spot: 'eddy', label: 'the eddy', hint: 'the calm pool downstream' },
]

export type RiverMember = {
  id: string
  displayName: string
  pose: AvatarPose
  spot: Spot
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
