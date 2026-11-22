// The targeting frame over the camera: four ink corner brackets, a tick at
// the middle of each side, and the red scan line (runnerRed is reserved for
// it). The line drifts gently up and down unless Reduce Motion is on.

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { color } from '../theme/tokens';

export interface ReticleProps {
  /** Frame size; the Scan mockup uses 206 × 122. */
  width?: number;
  height?: number;
  /** Bracket arm length. */
  arm?: number;
  /** Draw the red scan line. Off for the ingredient photo frame. */
  line?: boolean;
  /** Animate the line. Pass false when Reduce Motion is on, or not yet known. */
  animate?: boolean;
}

const BRACKET = 2.5;
const SWEEP_MS = 1800;

export function Reticle({ width = 206, height = 122, arm = 22, line = true, animate = false }: ReticleProps) {
  const sweep = useRef(new Animated.Value(0.5)).current;
  const moving = line && animate;

  useEffect(() => {
    if (!moving) {
      sweep.stopAnimation();
      sweep.setValue(0.5);
      return undefined;
    }
    sweep.setValue(0.5);
    const to = (value: number, duration: number) =>
      Animated.timing(sweep, { toValue: value, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true });
    const loop = Animated.loop(Animated.sequence([to(1, SWEEP_MS / 2), to(0, SWEEP_MS), to(0.5, SWEEP_MS / 2)]));
    loop.start();
    return () => loop.stop();
  }, [moving, sweep]);

  // A subtle drift: about a fifth of the frame either side of the centre.
  const amplitude = Math.round(height * 0.2);
  const translateY = sweep.interpolate({ inputRange: [0, 1], outputRange: [-amplitude, amplitude] });
  const corner = { width: arm, height: arm };

  return (
    <View style={{ width, height }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <View style={[styles.corner, corner, styles.topLeft]} />
      <View style={[styles.corner, corner, styles.topRight]} />
      <View style={[styles.corner, corner, styles.bottomLeft]} />
      <View style={[styles.corner, corner, styles.bottomRight]} />
      <View style={[styles.tickV, { left: width / 2 - 1, top: -10 }]} />
      <View style={[styles.tickV, { left: width / 2 - 1, bottom: -10 }]} />
      <View style={[styles.tickH, { top: height / 2 - 1, left: -10 }]} />
      <View style={[styles.tickH, { top: height / 2 - 1, right: -10 }]} />
      {line ? <Animated.View style={[styles.line, { top: height / 2 - 1, transform: [{ translateY }] }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  corner: {
    position: 'absolute',
    borderColor: color.ink,
  },
  topLeft: { left: 0, top: 0, borderTopWidth: BRACKET, borderLeftWidth: BRACKET },
  topRight: { right: 0, top: 0, borderTopWidth: BRACKET, borderRightWidth: BRACKET },
  bottomLeft: { left: 0, bottom: 0, borderBottomWidth: BRACKET, borderLeftWidth: BRACKET },
  bottomRight: { right: 0, bottom: 0, borderBottomWidth: BRACKET, borderRightWidth: BRACKET },
  tickV: {
    position: 'absolute',
    width: 2,
    height: 6,
    backgroundColor: color.ink,
  },
  tickH: {
    position: 'absolute',
    width: 6,
    height: 2,
    backgroundColor: color.ink,
  },
  line: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 2,
    backgroundColor: color.runnerRed,
  },
});
