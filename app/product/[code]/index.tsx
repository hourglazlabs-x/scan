// Result (mockups Result and Missing data). Looks the product up, then shows
// the score plate and the rules that moved the score most. A product that
// can't be scored shows what data there is, a way to photograph the
// ingredient list, and where the rest can be added.

import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Share, StyleSheet } from 'react-native';

import { useOnline, useProductLookup } from '../../../src/data/hooks';
import type { MissingInput, Product, ScoreResult } from '../../../src/domain/types';
import { joinList } from '../../../src/rubric/format';
import { RUBRIC } from '../../../src/rubric/index';
import { text } from '../../../src/theme/type';
import { Button } from '../../../src/ui/Button';
import { ConnectionChip } from '../../../src/ui/Chip';
import { LOOKUP_ERROR_COPY, formatBarcode, paramValue } from '../../../src/ui/format';
import { HaveList } from '../../../src/ui/HaveList';
import { HeaderBar, useGoBack } from '../../../src/ui/Header';
import { IngredientCapture } from '../../../src/ui/IngredientCapture';
import { MessagePlate } from '../../../src/ui/MessagePlate';
import { ProductHeader } from '../../../src/ui/ProductHeader';
import { Screen } from '../../../src/ui/Screen';
import { ScorePlate } from '../../../src/ui/ScorePlate';
import { Txt } from '../../../src/ui/Txt';
import { WhyPlate } from '../../../src/ui/WhyPlate';

const RUBRIC_LINE = `Rubric v${RUBRIC.version}${RUBRIC.status === 'draft' ? ' (draft)' : ''}`;
const FOOTER = `${RUBRIC_LINE} · Data from Open Food Facts contributors (ODbL)`;

const MISSING_TEXT: Record<MissingInput, string> = {
  nutrition: 'the nutrition facts',
  ingredients: 'the ingredient list',
  processing: 'the processing level',
};

export default function ResultScreen() {
  const params = useLocalSearchParams<{ code?: string; from?: string }>();
  const code = paramValue(params.code) ?? '';
  const backLabel = paramValue(params.from) === 'index' ? 'Index' : 'Scan';
  // A new key remounts the body, which runs a fresh lookup ("Try again").
  const [attempt, setAttempt] = useState(0);
  return (
    <ResultBody key={`${code}:${attempt}`} code={code} backLabel={backLabel} onRetry={() => setAttempt((n) => n + 1)} />
  );
}

interface ResultBodyProps {
  code: string;
  backLabel: string;
  onRetry: () => void;
}

function ResultBody({ code, backLabel, onRetry }: ResultBodyProps) {
  const state = useProductLookup(code.length > 0 ? code : null);
  const online = useOnline();
  const goBack = useGoBack('/');
  const [capturing, setCapturing] = useState(false);

  const center = online === false ? <ConnectionChip online={false} /> : null;
  const backLabelLower = backLabel === 'Index' ? 'Index' : 'scan';

  if (code.length === 0) {
    return (
      <Screen scroll>
        <HeaderBar backLabel={backLabel} onBack={goBack} />
        <MessagePlate icon="warning" title="No barcode to look up">
          <Button label={`Back to ${backLabelLower}`} onPress={goBack} />
        </MessagePlate>
      </Screen>
    );
  }

  if (state === null || state.status === 'loading') {
    return (
      <Screen scroll>
        <HeaderBar backLabel={backLabel} onBack={goBack} center={center} />
        <MessagePlate
          busy
          title="Looking up this product"
          body={`${formatBarcode(code)}. Checking this phone first, then Open Food Facts.`}
        />
      </Screen>
    );
  }

  if (state.status === 'not_found') {
    return (
      <Screen scroll>
        <HeaderBar backLabel={backLabel} onBack={goBack} center={center} />
        <MessagePlate
          icon="question"
          title="Not in Open Food Facts yet"
          body={`Open Food Facts has no product with the barcode ${formatBarcode(code)}, so there’s nothing to score.`}
        >
          <Button label={`Back to ${backLabelLower}`} onPress={goBack} />
        </MessagePlate>
      </Screen>
    );
  }

  if (state.status === 'error') {
    const copy = LOOKUP_ERROR_COPY[state.reason];
    return (
      <Screen scroll>
        <HeaderBar backLabel={backLabel} onBack={goBack} center={center} />
        <MessagePlate icon="warning" title={copy.title} body={copy.body}>
          {copy.canRetry ? <Button label="Try again" icon="sync" onPress={onRetry} /> : null}
          <Button
            label={`Back to ${backLabelLower}`}
            variant={copy.canRetry ? 'secondary' : 'primary'}
            onPress={goBack}
          />
        </MessagePlate>
      </Screen>
    );
  }

  const { product, result } = state;
  const scored = result.score !== null;
  const otherMissing = result.missing.filter((m) => m !== 'ingredients');

  return (
    <>
      <Screen scroll>
        <HeaderBar backLabel={backLabel} onBack={goBack} center={center} onShare={() => shareResult(product, result)} />
        <ProductHeader product={product} />
        <ScorePlate result={result} />

        {scored ? (
          <WhyPlate result={result} onShowAll={() => router.push(`/product/${code}/breakdown`)} />
        ) : (
          <>
            <HaveList product={product} result={result} />
            {result.missing.includes('ingredients') ? (
              <MessagePlate
                icon="camera"
                title="Photograph the ingredient list"
                body="Save a photo of the list on this phone. This version can’t read the text yet, so the score won’t change today. A later version will read it."
              >
                <Button label="Open camera" icon="camera" onPress={() => setCapturing(true)} />
              </MessagePlate>
            ) : null}
            {otherMissing.length > 0 ? (
              <MessagePlate
                icon="book"
                title="Help complete it on Open Food Facts"
                body={`Open Food Facts doesn’t have ${joinList(otherMissing.map((m) => MISSING_TEXT[m]))} for this product yet. Details added there fill it in for everyone.`}
              >
                <Button
                  label="Open on Open Food Facts"
                  icon="external"
                  variant="secondary"
                  accessibilityHint="Opens the product page in your browser"
                  onPress={() => {
                    Linking.openURL(`https://world.openfoodfacts.org/product/${product.code}`).catch(() => undefined);
                  }}
                />
              </MessagePlate>
            ) : null}
          </>
        )}

        <Txt style={styles.footer} tone="ink3" align="center">
          {FOOTER}
        </Txt>
      </Screen>

      {scored ? null : (
        <IngredientCapture visible={capturing} code={product.code} onClose={() => setCapturing(false)} />
      )}
    </>
  );
}

function shareResult(product: Product, result: ScoreResult) {
  const name = product.name ?? 'Unnamed product';
  const message = [
    product.brand ? `${name} (${product.brand})` : name,
    result.score === null
      ? `NUÏTRIX score: not scored (${result.gradeLabel})`
      : `NUÏTRIX score: ${result.score} of 100, ${result.gradeLabel}`,
    result.summary,
    `${RUBRIC_LINE}. Product data from Open Food Facts contributors (ODbL).`,
  ].join('\n');
  Share.share({ message }).catch(() => undefined);
}

const styles = StyleSheet.create({
  footer: {
    ...text.label,
    fontSize: 11,
    lineHeight: 14,
    marginTop: 2,
  },
});
