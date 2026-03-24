# Effort Tuning: Mini (med/high) vs Full (low/low)

**Date**: 2026-03-24 22:52 UTC

---

## Hypothesis

GPT-5.4 full was overthinking in the previous test (agent=low, extraction=high → 2/10 agreement, 8.3x cost). By lowering extraction effort to `low`, the full model should stop over-reasoning about date signals and just pick the obvious answer.

For Mini, bumping agent effort to `medium` gives it more reasoning during tool selection, and extraction `high` lets it thoroughly compare date signals.

## Config

| | Mini | Full |
|---|---|---|
| Model | gpt-5.4-mini | gpt-5.4 |
| Agent effort | medium | low |
| Extraction effort | high | low |
| allowed_domains | yes | yes |

## Results: 9/10 agree

| Court | Mini (med/high) | Full (low/low) | Match |
|---|---|---|---|
| Paris | 2026-03-10 (pdf-content) | 2026-03-10 (pdf-content) | ✓ |
| Lyon | 2026-02-13 (pdf-content) | 2026-02-13 (pdf-content) | ✓ |
| Angers | 2026-03-20 (page-text) | 2026-03-20 (page-text) | ✓ |
| Besançon | 2025-05-19 (page-text) | 2026-02-24 (page-text) | ✗ Full wins |
| Bordeaux | 2025-07-01 (filename) | 2025-07-01 (filename) | ✓ |
| Amiens | 2026-02-01 (page-text) | 2026-02-01 (page-text) | ✓ |
| Aix-en-Provence | 2026-02-19 (page-text) | 2026-02-19 (page-text) | ✓ |
| Rennes | 2026-03-04 (pdf-content) | 2026-03-04 (pdf-content) | ✓ |
| Cayenne | 2022-11-23 (filename) | 2022-11-23 (filename) | ✓ |
| Grenoble | 2026-02-27 (page-text) | 2026-02-27 (page-text) | ✓ |

## Cost and timing

| | Mini (med/high) | Full (low/low) | Ratio |
|---|---|---|---|
| Total cost | $0.27 | $0.59 | 2.2x |
| Total time | 345s | 387s | 1.1x |
| Avg per court | $0.027 / 34.5s | $0.059 / 38.7s | |

## Comparison with previous test (Test 24)

| | Test 24: Full (low/high) | Test 25: Full (low/low) |
|---|---|---|
| Agreement with Mini | 2/10 | **9/10** |
| Full cost | $0.56 | $0.59 |
| Full time | 423s | 387s |

**Lowering extraction effort from high to low dramatically improved agreement** — from 2/10 to 9/10. The full model was indeed overthinking the extraction step. With `low` extraction effort, it picks the obvious date without second-guessing itself.

## The one divergence: Besançon

Mini went down a rabbit hole — 9 turns, 73 seconds, hammering the legacy `ca-besancon.justice.fr` site. It found a 2025-05-19 date from an old page. Full took 4 turns, 50 seconds, and found the correct 2026-02-24 from the modern site's page text.

Besançon remains the hardest court — both the modern and legacy sites exist, and web search sometimes surfaces the legacy one first.

## Key insight

**Extraction effort should be low or medium, never high.** High extraction effort causes the model to over-reason about competing date signals, sometimes picking an older but "more authoritative-sounding" date over the obvious correct one. Low effort makes it just pick the most recent specific date — which is almost always right.

The best combos so far:
1. **Mini (agent=none, extraction=medium)** — cheapest at ~$0.007/court, good for most courts
2. **Mini (agent=medium, extraction=high)** — $0.027/court, better reasoning but Besançon fails
3. **Full (agent=low, extraction=low)** — $0.059/court, most consistent (9/10), but 2.2x cost vs Mini
