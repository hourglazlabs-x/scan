// Camera permission prompts. Before the system asks, explain why; after a
// refusal the system will not ask again, so point to Settings instead.

import { Linking } from 'react-native';

import { Button } from './Button';
import { MessagePlate } from './MessagePlate';

/** The parts of expo-camera's PermissionResponse this plate reads. */
export interface CameraPermissionState {
  granted: boolean;
  canAskAgain: boolean;
}

export interface CameraPermissionPlateProps {
  permission: CameraPermissionState;
  /** Calls the requestPermission function from useCameraPermissions. */
  onRequest: () => unknown;
  purpose?: 'scan' | 'photo';
}

export function CameraPermissionPlate({ permission, onRequest, purpose = 'scan' }: CameraPermissionPlateProps) {
  if (permission.canAskAgain) {
    return (
      <MessagePlate
        icon="camera"
        title={purpose === 'scan' ? 'Scan barcodes with the camera' : 'Photograph the list with the camera'}
        body={
          purpose === 'scan'
            ? 'The camera reads barcodes on your phone. A lookup sends only the barcode to Open Food Facts.'
            : 'The photo of the ingredient list is saved on this phone.'
        }
      >
        <Button label="Allow camera" icon="camera" onPress={() => void onRequest()} />
      </MessagePlate>
    );
  }
  return (
    <MessagePlate
      icon="camera"
      title="Camera access is off"
      body={
        purpose === 'scan'
          ? 'Turn on the camera for MINDMODX Scan in Settings to scan barcodes. Your Index still works without it.'
          : 'Turn on the camera for MINDMODX Scan in Settings to take the photo.'
      }
    >
      <Button
        label="Open Settings"
        icon="external"
        accessibilityHint="Opens this app’s page in Settings"
        onPress={() => {
          Linking.openSettings().catch(() => undefined);
        }}
      />
    </MessagePlate>
  );
}
