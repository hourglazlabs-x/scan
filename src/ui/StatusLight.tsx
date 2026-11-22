// A small status orb: the only glossy element in the app (the design
// system's "glass is earned" rule). A radial gradient gives the highlight;
// its shades are mixed from the colour tokens rather than restated.

import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { color } from '../theme/tokens';
import { useSvgId } from './uiHooks';

export type LightTone = 'green' | 'aqua' | 'silver' | 'amber' | 'red';

const BASE: Record<LightTone, string> = {
  green: color.signalGreen,
  aqua: color.aqua,
  silver: color.silver,
  amber: color.amber,
  red: color.runnerRed,
};

export interface StatusLightProps {
  tone: LightTone;
  /** Diameter of the orb in points. */
  size?: number;
  /** A faint 2 pt ring around the orb, as on the Scan screen's "Offline ready" light. */
  halo?: boolean;
}

export function StatusLight({ tone, size = 10, halo = false }: StatusLightProps) {
  const id = useSvgId('light');
  const base = BASE[tone];
  const outer = halo ? size + 4 : size;
  const c = outer / 2;
  return (
    <Svg width={outer} height={outer}>
      <Defs>
        {/* Same stops as the mockups' radial-gradient(circle at 35% 30%, …). */}
        <RadialGradient id={id} cx="35%" cy="30%" fx="35%" fy="30%" r="95%">
          <Stop offset="0" stopColor={color.plate} />
          <Stop offset="0.14" stopColor={color.plate} />
          <Stop offset="0.34" stopColor={mix(base, color.plate, 0.4)} />
          <Stop offset="0.72" stopColor={base} />
          <Stop offset="1" stopColor={mix(base, color.ink, 0.4)} />
        </RadialGradient>
      </Defs>
      {halo ? <Circle cx={c} cy={c} r={c} fill={base} fillOpacity={0.16} /> : null}
      <Circle cx={c} cy={c} r={size / 2} fill={`url(#${id})`} />
    </Svg>
  );
}

/** Mixes two #RRGGBB colours: `amount` 0 gives `from`, 1 gives `to`. */
function mix(from: string, to: string, amount: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a || !b) return from;
  const [r1, g1, b1] = a;
  const [r2, g2, b2] = b;
  const channel = (x: number, y: number) =>
    Math.round(x + (y - x) * amount)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r1, r2)}${channel(g1, g2)}${channel(b1, b2)}`;
}

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return null;
  return [parseInt(match[1] ?? '0', 16), parseInt(match[2] ?? '0', 16), parseInt(match[3] ?? '0', 16)];
}
