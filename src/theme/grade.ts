// How each grade looks. Colour is never alone: every grade pairs an icon and
// a word (the design system's rule), so the grade reads without colour too.

import type { GradeId } from '../domain/types.ts';
import { color } from './tokens.ts';

export type GradeIcon = 'tick' | 'warning' | 'cross';

export interface GradeLook {
  /** Text and icon colour (an -ink colour that holds 4.5:1 on its background). */
  fg: string;
  /** Badge background. */
  bg: string;
  /** Optional 1px border, used where the background alone is too faint. */
  border?: string;
  /** Colour of the arc on the score dial. */
  arc: string;
  icon: GradeIcon;
  /** Incomplete products show amber hazard stripes (the system's warning motif). */
  stripes: boolean;
}

export const GRADE_LOOK: Record<GradeId, GradeLook> = {
  optimal: { fg: color.greenInk, bg: color.well, arc: color.signalGreen, icon: 'tick', stripes: false },
  caution: { fg: color.amberInk, bg: color.well, border: color.amber, arc: color.amber, icon: 'warning', stripes: false },
  poor: { fg: color.redInk, bg: color.redTint, arc: color.runnerRed, icon: 'cross', stripes: false },
  incomplete: { fg: color.amberInk, bg: color.plate, border: color.amber, arc: color.silver, icon: 'warning', stripes: true },
};
