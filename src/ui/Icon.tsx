// Line icons from the MINDMODX Scan mockups, on a 24-unit grid, drawn with
// react-native-svg. Strokes use round caps and joins, as in the mockups.
// The last group are the category glyphs that Pictogram uses.

import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { color as palette } from '../theme/tokens';

type Shape =
  | { kind: 'path'; d: string }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number };

const path = (d: string): Shape => ({ kind: 'path', d });
const circle = (cx: number, cy: number, r: number): Shape => ({ kind: 'circle', cx, cy, r });
const rect = (x: number, y: number, w: number, h: number, rx: number): Shape => ({ kind: 'rect', x, y, w, h, rx });

const ICONS = {
  chevronLeft: [path('M15 5l-7 7 7 7')],
  chevronRight: [path('M9 5l7 7-7 7')],
  chevronDown: [path('M5 9l7 7 7-7')],
  share: [path('M12 3v12'), path('M7.5 7.5L12 3l4.5 4.5'), path('M5 12.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5')],
  flash: [path('M13 2.5L5 13.5h6l-1 8 8-11h-6l1-8z')],
  barcode: [
    path('M3 7V5a2 2 0 0 1 2-2h2'),
    path('M17 3h2a2 2 0 0 1 2 2v2'),
    path('M21 17v2a2 2 0 0 1-2 2h-2'),
    path('M7 21H5a2 2 0 0 1-2-2v-2'),
    path('M7.5 8v8'),
    path('M10.5 8v8'),
    path('M13.5 8v8'),
    path('M16.5 8v8'),
  ],
  grid: [rect(4, 4, 6.5, 6.5, 1.5), rect(13.5, 4, 6.5, 6.5, 1.5), rect(4, 13.5, 6.5, 6.5, 1.5), rect(13.5, 13.5, 6.5, 6.5, 1.5)],
  person: [circle(12, 8, 4), path('M4.5 20.5c1.4-3.6 4.3-5.5 7.5-5.5s6.1 1.9 7.5 5.5')],
  eye: [path('M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z'), circle(12, 12, 3)],
  tick: [path('M5 12.5l4.5 4.5L19 7.5')],
  cross: [path('M6 6l12 12'), path('M18 6L6 18')],
  warning: [path('M12 4L2.8 19.5h18.4L12 4z'), path('M12 10v4'), path('M12 16.8v.2')],
  question: [circle(12, 12, 9), path('M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.7.4-1.2.9-1.2 1.8v.3'), path('M12 16.9v.2')],
  camera: [
    path('M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z'),
    circle(12, 13.5, 3.5),
  ],
  sync: [
    path('M20 11a8 8 0 0 0-14.3-4.3'),
    path('M5 3.5v3.7h3.7'),
    path('M4 13a8 8 0 0 0 14.3 4.3'),
    path('M19 20.5v-3.7h-3.7'),
  ],
  play: [rect(3, 5, 18, 14, 3), path('M10.5 9.5v5l4-2.5-4-2.5z')],
  cart: [path('M3 4h2.2l2.3 10.2a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L20 7.5H6.1'), circle(9.5, 19, 1.5), circle(17, 19, 1.5)],
  book: [path('M12 6.5C10.5 5.3 8.3 4.5 4 4.5v14c4.3 0 6.5.8 8 2 1.5-1.2 3.7-2 8-2v-14c-4.3 0-6.5.8-8 2z'), path('M12 6.5v14')],
  external: [path('M7 17L17 7'), path('M8 7h9v9')],
  search: [circle(11, 11, 6.5), path('M16 16l4.5 4.5')],
  plus: [path('M12 6v12'), path('M6 12h12')],
  minus: [path('M6 12h12')],
  /** The "matched" ring from the Scan readout: two arcs closing on each other (the mockup's 18-unit icon, scaled to 24). */
  ring: [path('M10.93 3.4A8.67 8.67 0 0 0 10.93 20.6'), path('M13.07 3.4A8.67 8.67 0 0 1 13.07 20.6')],
  keyboard: [rect(2.5, 6.5, 19, 11, 2), path('M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01'), path('M7.5 14h9')],

  // Category glyphs (Pictogram). Deli tray, pouch, bowl and cup are from the Index mockup.
  deli: [rect(3, 7, 18, 11, 3), path('M7 12.5c1.6-2 3.2-2 4.8 0s3.2 2 4.8 0')],
  pouch: [path('M7.5 3.5h9l1.5 17h-12l1.5-17z'), path('M7.2 7.5h9.6'), path('M10 12.5h.01M13.5 14h.01M11 16.5h.01')],
  bowl: [path('M3.5 11.5h17a8.5 8.5 0 0 1-17 0z'), path('M8.5 8l1-2.5M12 8V5M15.5 8l-1-2.5')],
  cup: [path('M5.5 7h13l-1.6 13.5H7.1L5.5 7z'), path('M4.5 7h15'), path('M8 3.5h8')],
  bottle: [
    path('M10.5 2.5h3v3.2l2.6 3.3c.3.4.4.8.4 1.2v9.3a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-9.3c0-.4.1-.8.4-1.2l2.6-3.3z'),
    path('M10.5 4.5h3'),
    path('M7.5 13.5h9'),
  ],
  package: [path('M12 3.5l8 4v9l-8 4-8-4v-9z'), path('M4 7.5l8 4 8-4'), path('M12 11.5v9')],
} satisfies Record<string, readonly Shape[]>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  /** Rendered size in points. */
  size?: number;
  color?: string;
  /** In grid units (the mockups use 2 for most icons, 2.5 to 3 for small markers). */
  strokeWidth?: number;
}

/** Decorative: the control that holds an icon carries the accessible label. */
export function Icon({ name, size = 20, color = palette.ink, strokeWidth = 2 }: IconProps) {
  const shapes: readonly Shape[] = ICONS[name];
  const stroke = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {shapes.map((shape, i) => {
        switch (shape.kind) {
          case 'path':
            return <Path key={i} d={shape.d} {...stroke} />;
          case 'circle':
            return <Circle key={i} cx={shape.cx} cy={shape.cy} r={shape.r} {...stroke} />;
          case 'rect':
            return <Rect key={i} x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx} {...stroke} />;
          default:
            return null;
        }
      })}
    </Svg>
  );
}
