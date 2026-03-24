# Split Effort Breakthrough: agent none + extraction medium

**Date**: 2026-03-24 14:16 UTC

---

## The change

One line in the extraction step:

```typescript
providerOptions: {
  openai: { reasoningEffort: "medium" },
},
```

Agent step stays at `effort: "none"` (parallel tool bug prevents reasoning there).
Extraction step now uses `effort: "medium"` (no tools = no bug, safe to reason).

---

## Results: 5 out of 6 divergent courts now match ground truth

| Court | Old Mini (none/none) | New Mini (none/medium) | Ground truth | Fixed? |
|---|---|---|---|---|
| Paris | 2026-03-10 | 2026-03-10 | 2026-03-10 | Already correct |
| Lyon | 2025-11-21 | 2025-11-21 | 2025-11-21 | Already correct |
| **Amiens** | 2022-12-05 | **2026-02-01** | ~2026-02 | **Yes** |
| **Angers** | 2025-11-18 | **2026-03-20** | 2026-03-20 | **Yes** |
| **Besançon** | 2013-03-20 | **2026-02-24** | 2026-02-24 | **Yes** |
| Bordeaux | 2025-01-01 | 2025-01-01 | ~2025-07 | No (no date exists) |

## What changed in the model's behaviour

At `effort: "none"`, the extraction model pattern-matched: it saw "POUR L'ANNEE 2026" in the PDF text and returned `2026-01-01`. It ignored page-text dates because it wasn't reasoning about which source is more specific.

At `effort: "medium"`, the extraction model **reasoned** about the date signals:

- **Amiens**: "The page contains 'MAJ 02/2026'. Following the rule for month-only dates, normalized to 2026-02-01."
- **Angers**: "The most specific and most recent date is 'mise à jour : 20/03/2026' from the page. This overrides the year-only PDF title."
- **Besançon**: "La date la plus spécifique est 'mise à jour : 24/02/2026' dans le texte de la page. Cette date exacte est plus précise que l'année seule du PDF."

The model now correctly applies the rule: **a year-only mention must never override a more specific date from any other source.**

## Why this works without triggering the parallel tool bug

The parallel tool bug occurs when:
1. Reasoning is enabled AND
2. The model makes parallel tool calls AND
3. The SDK interleaves calls/outputs in the conversation history

Our extraction step has **no tools** — it's a clean prompt → structured output. No tool calls, no interleaving, no bug. Reasoning is safe here.

## Cost and speed impact

| Config | Cost/court | Time/court | Accuracy (6 courts) |
|---|---|---|---|
| none/none | $0.026 | 12s | 2/6 match ground truth |
| **none/medium** | **$0.027** | **15s** | **5/6 match ground truth** |
| Sonnet low/low | $0.70 | 60s | 3/6 match ground truth |

The cost increase is negligible — ~$0.001/court extra for reasoning tokens on the extraction step. The accuracy jump is dramatic.

## Bordeaux: the unsolvable court

Bordeaux's PDF says "POUR L'ANNEE 2025" with no specific date. The page has no "mise à jour" hint. The URL path `/2025-07/` suggests July 2025. No model — at any reasoning level — can find a date that doesn't exist. Sonnet returned `2025-07-01` by parsing the URL path, which is the best approximation available.

**Possible fix**: extract the URL path date deterministically in `toModelOutput` and present it as a separate signal to the extraction model.

## Configuration summary

```
Step 1 — Agent (GPT-5.4 Mini)
  effort: "none" (forced by parallel tool bug)
  tools: webSearch + fetchPage + extractPdfDate

Step 2 — Extraction (GPT-5.4 Mini)
  effort: "medium" (safe, no tools)
  output: Output.object (native structured output)
  prompt: clean summary from agent + date priority rules
```
