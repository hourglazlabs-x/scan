// Type styles. Michroma carries the wordmark, titles and numerals; Geist
// carries everything people read; Geist Mono only literal identifiers
// (barcodes, rule ids). Sizes are a step above the console version of the
// design system so they read well on a phone.
//
// React Native picks a weight by family name, so each weight is its own
// family. The names match the exports of @expo-google-fonts/michroma,
// @expo-google-fonts/geist and @expo-google-fonts/geist-mono, which
// app/_layout.tsx loads.

import type { TextStyle } from 'react-native';

export const font = {
  display: 'Michroma_400Regular',
  sans: 'Geist_400Regular',
  sansMedium: 'Geist_500Medium',
  sansSemibold: 'Geist_600SemiBold',
  sansBold: 'Geist_700Bold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
} as const;

const style = <T extends TextStyle>(s: T): T => s;

export const text = {
  /** "MINDMODX" above a screen title. Tracking 0.12em. */
  wordmark: style({ fontFamily: font.display, fontSize: 13, lineHeight: 16, letterSpacing: 1.56 }),
  screenTitle: style({ fontFamily: font.display, fontSize: 26, lineHeight: 32 }),
  pageTitle: style({ fontFamily: font.display, fontSize: 18, lineHeight: 24 }),
  /** Plate headers such as "Why it scored 28". */
  sectionTitle: style({ fontFamily: font.display, fontSize: 12, lineHeight: 16 }),
  /** The score inside the dial. */
  numeralXL: style({ fontFamily: font.display, fontSize: 40, lineHeight: 44 }),
  numeral: style({ fontFamily: font.display, fontSize: 24, lineHeight: 28 }),
  productName: style({ fontFamily: font.sansSemibold, fontSize: 20, lineHeight: 25, letterSpacing: -0.2 }),
  value: style({ fontFamily: font.sansSemibold, fontSize: 16, lineHeight: 20 }),
  rowTitle: style({ fontFamily: font.sansSemibold, fontSize: 14, lineHeight: 18 }),
  narrator: style({ fontFamily: font.sans, fontSize: 15, lineHeight: 22 }),
  body: style({ fontFamily: font.sans, fontSize: 14, lineHeight: 20 }),
  label: style({ fontFamily: font.sans, fontSize: 12, lineHeight: 16 }),
  labelStrong: style({ fontFamily: font.sansSemibold, fontSize: 12, lineHeight: 16 }),
  micro: style({ fontFamily: font.sansSemibold, fontSize: 11, lineHeight: 14 }),
  mono: style({ fontFamily: font.mono, fontSize: 12, lineHeight: 16 }),
  button: style({ fontFamily: font.sansSemibold, fontSize: 15, lineHeight: 20 }),
  tab: style({ fontFamily: font.sansMedium, fontSize: 11, lineHeight: 14 }),
} as const;
