# NUÏTRIX rubric v0.1: DRAFT

The rubric is the rulebook that turns a product's data into its NUÏTRIX score. It lives in [`src/rubric/nuitrix-v0.1.json`](../src/rubric/nuitrix-v0.1.json). The engine in [`src/rubric/engine.ts`](../src/rubric/engine.ts) applies it.

**Status: draft.** Before anything ships, the founder needs to decide:

- the weights
- the additive list
- the bonuses
- whether the three pillars are the right ones

The thresholds come from the sources listed below. Every citation was written from memory and is marked `checked: false` until someone checks it against the original.

## How a score is built

1. There are three pillars. Each one starts at its maximum:

   | Pillar | Max |
   | --- | --- |
   | Nutrient profile | 50 |
   | Additives | 30 |
   | Processing | 20 |

2. Every rule adds or removes points within its pillar.
3. Each pillar is then clamped to the range 0 to max. The breakdown shows "capped" when clamping changed the value.
4. The score is the sum of the pillars, from 0 to 100.
5. Grades:

   | Grade | Score |
   | --- | --- |
   | Optimal | 70 to 100 |
   | Caution | 40 to 69 |
   | Poor | 0 to 39 |

6. **Incomplete.** A product isn't scored if a pillar is missing what it needs. The app shows what is missing, and never a guessed score.

   | Missing | Pillar affected |
   | --- | --- |
   | Any of salt, sugars, saturated fat or fat | Nutrient profile |
   | The ingredient list, so additives are unknown | Additives |
   | The NOVA processing group | Processing |

The same product and the same rubric always give the same result. The engine is a pure function, with no randomness, no network and no AI.

### Points that count

Clamping means a rule can be worth more than it changes. A bonus on a pillar already at its maximum adds nothing. So does a second high-risk additive once the additives pillar is at 0. Each rule therefore records two numbers:

- `points`: what the rule is worth
- `counted`: what it actually changed

For a capped pillar, the order is fixed:

- Over the maximum: the largest bonus counts first, and only as far as it makes up for penalties.
- Below zero: the largest penalty counts first, until the pillar reaches 0.

Within each pillar, the counted points add up exactly to what the pillar changed. The one-sentence summary and "Why it scored" use counted points only, so they never credit a rule that changed nothing. The breakdown shows both numbers when they differ.

Amounts are compared at the precision they are displayed (two decimals), so a label never reads "1.5 g" while the rule treats the amount as above 1.5 g. Additive ratings are worded as the rubric's rating ("Rated high risk"), not as facts about the additive.

## Nutrient profile (max 50)

### Limits

Amounts are per 100 g, or per 100 ml for drinks. A product counts as a drink when its categories include `en:beverages`.

| Rule | Nutrient | Low, food | High, food | Low, drink | High, drink | Medium points | High points |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NX-N01 | Salt | ≤ 0.3 g | > 1.5 g | ≤ 0.3 g | > 0.75 g | −8 | −20 |
| NX-N02 | Sugars | ≤ 5 g | > 22.5 g | ≤ 2.5 g | > 11.25 g | −8 | −20 |
| NX-N03 | Saturated fat | ≤ 1.5 g | > 5 g | ≤ 0.75 g | > 2.5 g | −5 | −14 |
| NX-N04 | Fat | ≤ 3 g | > 17.5 g | ≤ 1.5 g | > 8.75 g | −3 | −8 |

"Medium" means above the low threshold and up to the high threshold. The thresholds are the UK front-of-pack traffic-light criteria (source `uk-fop`). The points are draft.

### Bonuses

| Rule | Nutrient | "Source of" | "High" | Points (source / high) |
| --- | --- | --- | --- | --- |
| NX-N11 | Protein | ≥ 12 % of energy | ≥ 20 % of energy | +3 / +6 |
| NX-N12 | Fiber | ≥ 3 g per 100 g | ≥ 6 g per 100 g | +3 / +6 |

The levels match the EU nutrition-claim conditions for "source of" and "high" (source `eu-claims`).

- Protein's share of energy uses 4 kcal per gram, and the displayed percentage is rounded down.
- If protein alone would supply more energy than the product states, the energy value is wrong. The bonus is then not counted.
- A missing value skips a bonus; it never blocks the score.

## Additives (max 30)

| Risk | Points per additive |
| --- | --- |
| High | −30 |
| Moderate | −10 |
| Low | 0 |

| Code | Name | Risk | Sources |
| --- | --- | --- | --- |
| E249 | Potassium nitrite | High | iarc-94, efsa-nitrites-2017 |
| E250 | Sodium nitrite | High | iarc-94, efsa-nitrites-2017 |
| E251 | Sodium nitrate | High | iarc-94, efsa-nitrates-2017 |
| E252 | Potassium nitrate | High | iarc-94, efsa-nitrates-2017 |
| E171 | Titanium dioxide | High | efsa-e171-2021 |
| E320 | Butylated hydroxyanisole (BHA) | Moderate | iarc-bha, ntp-roc |
| E150d | Sulfite ammonia caramel | Moderate | iarc-101 |
| E951 | Aspartame | Moderate | iarc-134, jecfa-2023 |
| E300 | Ascorbic acid | Low | efsa-ascorbates-2015 |
| E301 | Sodium ascorbate | Low | efsa-ascorbates-2015 |
| E302 | Calcium ascorbate | Low | efsa-ascorbates-2015 |

An additive that isn't on this list is **unrated**. It costs no points, and the breakdown lists it as "not yet rated". It is never called safe. The list is deliberately short: each entry needs evidence the founder accepts.

## Processing (max 20)

| Rule | Condition | Points |
| --- | --- | --- |
| NX-P01 | NOVA 1 (unprocessed or minimally processed) | 0 |
| NX-P01 | NOVA 2 (processed culinary ingredient) | −4 |
| NX-P01 | NOVA 3 (processed food) | −12 |
| NX-P01 | NOVA 4 (ultra-processed food) | −20 |
| NX-P02 | Processed meat (hams, bacon, sausages, salami, cured meats, hot dogs) | −8 |

The NOVA group comes from Open Food Facts, which assigns it from the ingredients (source `nova-2019`). The processed-meat rule follows IARC's 2015 evaluation (source `iarc-114`).

## Worked example (from the tests)

A sliced ham with 2.6 g salt, 2.1 g saturated fat, 4 g fat and 17 g protein per 100 g (110 kcal), containing E250 and E301, NOVA 4:

| Pillar | Calculation | Result |
| --- | --- | --- |
| Nutrient profile | 50 − 20 (salt, high) − 5 (saturated fat, medium) − 3 (fat, medium) + 6 (protein, 62 % of energy) | 28 |
| Additives | 30 − 30 (E250, high risk) + 0 (E301, low risk) | 0 |
| Processing | 20 − 20 (NOVA 4) − 8 (processed meat) = −8 | 0 (capped) |

The score is 28, graded **Poor**. Summary: "Added sodium nitrite and high salt outweigh the high protein."

In processing, NOVA 4 counts −20 and the processed-meat rule counts 0, because the pillar is already at 0.

## Known issues with the draft weights

These came from the independent review. They are rubric questions for the founder, not code bugs.

- **Regular versus diet cola.** Regular cola (medium sugar per 100 ml) scores about 62 Caution. Diet cola (aspartame, rated moderate) scores about 60 Caution. The sugared drink ranks higher.
- **Additives missing from US labels.** US ingredient lists often name additives without E-numbers. Open Food Facts still maps many of them, but "uncured" meats cured with celery powder carry natural nitrite that no E250 tag will catch.
- **Protein bonus on low-energy foods.** A 5 kcal broth with 0.5 g protein qualifies as "high protein" by share of energy. A minimum amount per 100 g may be wanted.
- **Repeated additives.** With the current weights, a second high-risk additive changes nothing, and neither does the processed-meat rule on a NOVA 4 product. Both still show in the breakdown with counted 0.

Before testers see scores, score about 20 well-known US products and review them.

## Sources

None of these citations has been checked against the original yet.

| Id | Source | Year |
| --- | --- | --- |
| uk-fop | DHSC and FSA, front-of-pack nutrition labelling guidance | 2016 |
| eu-claims | Regulation (EC) No 1924/2006, Annex | 2006 |
| iarc-94 | IARC Monographs Vol. 94: ingested nitrate and nitrite (Group 2A under nitrosating conditions) | 2010 |
| iarc-114 | IARC Monographs Vol. 114: red and processed meat (processed meat Group 1) | 2018 |
| efsa-nitrites-2017 | EFSA re-evaluation of E 249 and E 250 (EFSA Journal 15(6):4786) | 2017 |
| efsa-nitrates-2017 | EFSA re-evaluation of E 251 and E 252 (EFSA Journal 15(6):4787) | 2017 |
| efsa-e171-2021 | EFSA safety assessment of titanium dioxide, E171 (EFSA Journal 19(5):6585) | 2021 |
| iarc-bha | IARC Monographs Supplement 7: BHA (Group 2B) | 1987 |
| ntp-roc | NTP Report on Carcinogens: BHA | 2021 |
| iarc-101 | IARC Monographs Vol. 101: 4-methylimidazole (Group 2B) | 2013 |
| iarc-134 | IARC Monographs Vol. 134: aspartame (Group 2B) | 2023 |
| jecfa-2023 | JECFA 96th meeting: aspartame ADI 0–40 mg/kg reaffirmed | 2023 |
| efsa-ascorbates-2015 | EFSA re-evaluation of E 300–E 302 (EFSA Journal 13(5):4087) | 2015 |
| nova-2019 | Monteiro et al., Public Health Nutrition 22(5):936–941 | 2019 |

## Decisions for the founder

1. **Pillars and weights.** Keep the 50/30/20 split, or change it?
2. **Penalty sizes.** Should one high-risk additive wipe out the whole additives pillar (−30), as now?
3. **The additive list.** Which additives, at which risk level, on which evidence? This is where the MINDMODX philosophy shows most.
4. **Bonuses.** Protein and fiber now. Add others, such as whole grains or fruit and vegetable content?
5. **Category rules.** Processed meat now. Add others, such as sugary drinks?
6. **Grade names and bands.** Optimal, Caution and Poor at 70 and 40?

## Changing the rubric

1. Edit the JSON.
2. Raise `version`. Scores aren't stored: history is re-scored with the current rubric every time it's shown, so past scans change too.
3. Run `npm test`. The validator rejects a broken file and lists every problem, for example:
   - unknown sources or duplicate ids
   - a limit nutrient missing or listed twice
   - energy-share levels written as percentages
   - pillars that don't add up to 100, or grades out of order
4. Set `checked: true` on a source only after reading the original. The validator refuses `"status": "approved"` while any source is unchecked.
