// Full-screen capture of an ingredient-list photo. Version 1 only stores the
// photo (useQueueIngredientPhoto) for a later version to read; it does not
// read the text, and the confirmation says so.

import { useRef, useState, type ReactNode } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useQueueIngredientPhoto } from '../data/hooks';
import { color, radius, space } from '../theme/tokens';
import { Button } from './Button';
import { CameraPermissionPlate } from './CameraPermission';
import { Chip } from './Chip';
import { IconButton } from './Header';
import { Icon } from './Icon';
import { MessagePlate } from './MessagePlate';
import { Reticle } from './Reticle';
import { Txt } from './Txt';

export interface IngredientCaptureProps {
  visible: boolean;
  /** The product's code, as the data layer keys it (product.code). */
  code: string;
  onClose: () => void;
}

export function IngredientCapture({ visible, code, onClose }: IngredientCaptureProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      {/* Modals render outside the root view, so they get their own safe-area provider. */}
      <SafeAreaProvider>{visible ? <CaptureBody code={code} onClose={onClose} /> : null}</SafeAreaProvider>
    </Modal>
  );
}

type Phase = 'camera' | 'saving' | 'saved' | 'failed';

function CaptureBody({ code, onClose }: { code: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const queuePhoto = useQueueIngredientPhoto();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<Phase>('camera');

  const capture = async () => {
    const cam = camera.current;
    if (!cam || !ready || phase !== 'camera') return;
    setPhase('saving');
    try {
      const photo = await cam.takePictureAsync({ quality: 0.7 });
      if (!photo?.uri) throw new Error('The camera returned no photo.');
      await queuePhoto(code, photo.uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setPhase('saved');
    } catch {
      setPhase('failed');
    }
  };

  const retry = () => {
    setReady(false);
    setPhase('camera');
  };

  const safePadding = { paddingTop: insets.top + space.s1, paddingBottom: insets.bottom + space.s4 };

  if (phase === 'saved' || phase === 'failed' || !permission?.granted) {
    let body: ReactNode;
    if (phase === 'saved') {
      body = (
        <MessagePlate
          icon="tick"
          title="Photo saved"
          body="The photo of the ingredient list is saved on this phone. This version can’t read the text yet, so the score stays as it is. A later version will read it and score this product."
        >
          <Button label="Done" onPress={onClose} />
        </MessagePlate>
      );
    } else if (phase === 'failed') {
      body = (
        <MessagePlate icon="warning" title="The photo wasn’t saved" body="Something went wrong while taking or saving it.">
          <Button label="Try again" icon="camera" onPress={retry} />
          <Button label="Close" variant="secondary" onPress={onClose} />
        </MessagePlate>
      );
    } else if (!permission) {
      body = <ActivityIndicator color={color.ink3} />;
    } else {
      body = <CameraPermissionPlate permission={permission} onRequest={requestPermission} purpose="photo" />;
    }
    return (
      <View style={[styles.sheet, safePadding]}>
        <StatusBar style="dark" />
        <View style={styles.sheetHeader}>
          <IconButton icon="cross" label="Close" onPress={onClose} />
        </View>
        <View style={styles.sheetBody}>{body}</View>
      </View>
    );
  }

  const saving = phase === 'saving';
  const frameWidth = width - 48;
  const frameHeight = Math.min(height * 0.48, frameWidth * 1.25);

  return (
    <View style={styles.cameraRoot}>
      <StatusBar style="light" />
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setReady(true)} />
      <View style={[StyleSheet.absoluteFill, safePadding]} pointerEvents="box-none">
        <View style={styles.topBar}>
          <IconButton icon="cross" label="Close" onPress={onClose} variant="plate" />
          <Chip size="lg" elevated accessibilityLabel="Ingredient list photo">
            <Icon name="camera" size={16} color={color.ink} />
            <Txt variant="labelStrong">Ingredient list</Txt>
          </Chip>
          <View style={styles.topBarBalance} />
        </View>
        <View style={styles.frameArea} pointerEvents="none">
          <Reticle width={frameWidth} height={frameHeight} arm={28} line={false} />
        </View>
        <View style={styles.bottom}>
          <Chip size="md" elevated>
            <Txt variant="labelStrong" tone="ink2">
              Fit the whole list inside the frame
            </Txt>
          </Chip>
          <Pressable
            onPress={() => void capture()}
            disabled={!ready || saving}
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            accessibilityState={{ disabled: !ready || saving, busy: saving }}
            style={({ pressed }) => [styles.shutter, pressed && styles.shutterPressed, !ready && styles.shutterWaiting]}
          >
            <View style={styles.shutterInner}>{saving ? <ActivityIndicator color={color.ink} /> : null}</View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: color.ground,
    paddingHorizontal: space.s4,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginRight: -10,
  },
  sheetBody: {
    flex: 1,
    justifyContent: 'center',
  },
  cameraRoot: {
    flex: 1,
    backgroundColor: color.ink,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.s4,
  },
  topBarBalance: {
    width: 44,
  },
  frameArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: {
    alignItems: 'center',
    gap: space.s4,
  },
  shutter: {
    width: 72,
    height: 72,
    padding: 4,
    borderRadius: radius.pill,
    borderWidth: 4,
    borderColor: color.plate,
  },
  shutterPressed: {
    opacity: 0.8,
  },
  shutterWaiting: {
    opacity: 0.5,
  },
  shutterInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: color.plate,
  },
});
