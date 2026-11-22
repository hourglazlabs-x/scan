// Object mode placeholder. The Object entry mockup shows the next phase:
// naming an object from a photo needs an online image model, which v1 does
// not have. This screen says so and lists what an entry will hold, with no
// sample data.

import { StyleSheet, View } from 'react-native';

import { Button } from '../src/ui/Button';
import { HeaderBar, useGoBack } from '../src/ui/Header';
import type { IconName } from '../src/ui/Icon';
import { MessagePlate } from '../src/ui/MessagePlate';
import { ListRow, Plate, PlateHeader } from '../src/ui/Plate';
import { Screen } from '../src/ui/Screen';
import { IconTile } from '../src/ui/Tile';
import { Txt } from '../src/ui/Txt';

const ENTRY_PARTS: ReadonlyArray<{ icon: IconName; title: string; detail: string }> = [
  { icon: 'eye', title: 'Summary', detail: 'What it is, in a few sentences, with its sources' },
  { icon: 'grid', title: 'Quick facts', detail: 'Key details at a glance' },
  { icon: 'play', title: 'Videos', detail: 'How it works and how to choose one' },
  { icon: 'cart', title: 'Where to buy', detail: 'Listings from shops, with prices' },
  { icon: 'book', title: 'Articles', detail: 'Background reading' },
];

export default function ObjectScreen() {
  const goBack = useGoBack('/');
  return (
    <Screen scroll gap={12}>
      <HeaderBar backLabel="Scan" onBack={goBack} />

      <View style={styles.title}>
        <Txt variant="pageTitle" accessibilityRole="header">
          Object mode
        </Txt>
        <Txt variant="label" tone="ink3">
          Coming in the next phase
        </Txt>
      </View>

      <MessagePlate
        icon="eye"
        title="Naming an object needs an online image model"
        body="Point the camera at an object, like a keyboard, and the app will say what it is. That takes an image model that runs online, so it comes in the next phase. Barcode mode works today. Products you’ve scanned before also work without signal."
      />

      <Plate>
        <PlateHeader title="What an entry will hold" />
        {ENTRY_PARTS.map((part) => (
          <ListRow
            key={part.title}
            leading={<IconTile icon={part.icon} variant="ink" size={30} iconSize={17} />}
            title={part.title}
            detail={part.detail}
          />
        ))}
      </Plate>

      <Button label="Back to scan" icon="barcode" onPress={goBack} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    gap: 2,
    paddingTop: 2,
  },
});
