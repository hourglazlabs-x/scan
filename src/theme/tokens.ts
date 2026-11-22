// LABS ANALYTIX design system tokens (Day theme), copied from the design
// system's tokens.json, version 1791075353-8795:
// https://claude.ai/artifact/VzzAdDJ3TAxBZUQMYLCo22
//
// Rules carried over from the system:
// - White first: plates on ground, separated by plateRim hairlines and shadow.
// - Red means the path: runnerRed only for the scan line, the active
//   selection and faults (a Poor grade). Never decoration.
// - Glass is earned: glossy treatment only on small status lights.
// - Colour is never alone: pass/fail always pairs a tick or cross and a word.

export const color = {
  ground: '#F2F4F7',
  plate: '#FFFFFF',
  well: '#F4F6F9',
  ink: '#0C1824',
  ink2: '#3A4A5A',
  ink3: '#5A6A7A',
  hair: 'rgba(12,24,36,0.13)',
  plateRim: '#DCE2E8',
  runnerRed: '#E3232C',
  redInk: '#C9141E',
  redTint: 'rgba(227,35,44,0.10)',
  aqua: '#0A9FDF',
  aquaInk: '#0672A8',
  aquaTint: 'rgba(10,159,223,0.12)',
  signalGreen: '#17A058',
  greenInk: '#127A41',
  amber: '#F29F05',
  amberInk: '#8A5300',
  tile: '#0C1824',
  tileFg: '#FFFFFF',
  silver: '#AEB9C4',
} as const;

export type ColorName = keyof typeof color;

export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s6: 24,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 10,
  xl: 16,
  pill: 999,
} as const;

/** iOS shadow props approximating the system's shadow-plate and shadow-card. */
export const shadow = {
  plate: {
    shadowColor: '#0C2846',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
  },
  card: {
    shadowColor: '#0C2846',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
} as const;

/** Minimum touch target, per the design craft rules. */
export const TOUCH_TARGET = 44;
