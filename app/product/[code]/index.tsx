// Result (mockups Result and Missing data). Looks the product up, then shows
// the score plate and the rules that moved the score most. A product that
// can't be scored shows what data there is, a way to photograph the
// ingredient list, and where the rest can be added.

import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Share, StyleSheet } from 'react-native';

import type { LookupErrorReason } from '../../../src/data/contracts';
import { useOnline, useProductLookup } from '../../../src/data/hooks';
import type { MissingInput, Product, ScoreResult } from '../../../src/domain/types';
import { joinList } from '../../../src/rubric/format';
import { text } from '../../../src/theme/type';
import { Button } from '../../../src/ui/Button';
import { ConnectionChip } from '../../../src/ui/Chip';
import { RUBRIC_IS_DRAFT, RUBRIC_LINE } from '../../../src/ui/Draft';
import {
  LOOKUP_ERROR_COPY,
  formatBarcode,
  formatPoints,
  paramValue,
  rateLimitText,
  savedCopyText,
} from '../../../src/ui/format';
import { HaveList } from '../../../src/ui/HaveList';
import { HeaderBar, useGoBack } from '../../../src/ui/Header';
import { IngredientCapture } from '../../../src/ui/IngredientCapture';
import { MessagePlate } from '../../../src/ui/MessagePlate';
import { ProductHeader } from '../../../src/ui/ProductHeader';
import { Screen } from '../../../src/ui/Screen';
import { ScorePlate } from '../../../src/ui/ScorePlate';
import { Txt } from '../../../src/ui/Txt';
import { useCountdown } from '../../../src/ui/uiHooks';
import { WhyPlate, topHits } from '../../../src/ui/WhyPlate';

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
    return (
      <Screen scroll>
        <HeaderBar backLabel={backLabel} onBack={goBack} center={center} />
        <LookupErrorPlate
          reason={state.reason}
          retryAfterMs={state.retryAfterMs}
          backButtonLabel={`Back to ${backLabelLower}`}
          onRetry={onRetry}
          onBack={goBack}
        />
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

        {state.from === 'cache' ? <SavedLine fetchedAt={state.fetchedAt} /> : null}
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

interface LookupErrorPlateProps {
  reason: LookupErrorReason;
  /** Rate limits only: how long Open Food Facts asked us to wait. */
  retryAfterMs?: number;
  backButtonLabel: string;
  onRetry: () => void;
  onBack: () => void;
}

/** A failed lookup. A rate limit with a wait time counts down, and "Try again" stays off until it ends. */
function LookupErrorPlate({ reason, retryAfterMs, backButtonLabel, onRetry, onBack }: LookupErrorPlateProps) {
  const copy = LOOKUP_ERROR_COPY[reason];
  const waitSeconds = useCountdown(reason === 'rate_limited' ? retryAfterMs : undefined);
  const waiting = waitSeconds !== null && waitSeconds > 0;
  return (
    <MessagePlate icon="warning" title={copy.title} body={reason === 'rate_limited' ? rateLimitText(waitSeconds) : copy.body}>
      {copy.canRetry ? (
        <Button
          label={waiting ? `Try again in ${waitSeconds} s` : 'Try again'}
          icon="sync"
          disabled={waiting}
          onPress={onRetry}
        />
      ) : null}
      <Button label={backButtonLabel} variant={copy.canRetry ? 'secondary' : 'primary'} onPress={onBack} />
    </MessagePlate>
  );
}

/** "Saved on this phone · 21 Nov 2026", with "may be out of date" after 30 days. */
function SavedLine({ fetchedAt }: { fetchedAt: string }) {
  const { text: line, stale } = savedCopyText(fetchedAt);
  return (
    <Txt style={styles.footer} tone="ink3" align="center">
      {line}
      {stale ? (
        <Txt style={styles.footer} tone="amberInk">
          {' · may be out of date'}
        </Txt>
      ) : null}
    </Txt>
  );
}

function shareResult(product: Product, result: ScoreResult) {
  const name = product.name ?? 'Unnamed product';
  const draft = RUBRIC_IS_DRAFT ? ' (draft rubric)' : '';
  const lines = [
    product.brand ? `${name} (${product.brand})` : name,
    result.score === null
      ? `NUÏTRIX score: not scored (${result.gradeLabel})`
      : `NUÏTRIX score: ${result.score} of 100, ${result.gradeLabel}${draft}`,
    result.summary,
  ];
  // The same rules as "Why it scored", with the points they actually counted.
  if (result.score !== null) {
    for (const hit of topHits(result.hits)) lines.push(`${hit.label}: ${formatPoints(hit.counted)}`);
  }
  lines.push(`${RUBRIC_LINE}. Product data from Open Food Facts contributors (ODbL).`);
  Share.share({ message: lines.join('\n') }).catch(() => undefined);
}

const styles = StyleSheet.create({
  footer: {
    ...text.label,
    fontSize: 11,
    lineHeight: 14,
    marginTop: 2,
  },
});
