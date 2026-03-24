# GPT-5.4 Mini Default Reasoning: effort "none"

**Date**: 2026-03-24 13:37 UTC

---

## Discovery

Our 36-court Mini batch ran with **no reasoning configuration** — meaning GPT-5.4 Mini used its default `reasoning.effort: "none"`.

Per [OpenAI docs](https://developers.openai.com/api/docs/models/gpt-5.4): the default for GPT-5.2 and newer (including 5.4 Mini) is `"none"`. This means:
- **No internal reasoning/thinking** — model skips extended reasoning entirely
- Behaves like a **non-thinking model** — pattern matching only
- Fastest and cheapest mode

## What this means for our results

Our 36/36 success rate at $0.92 total was achieved with the model doing **zero reasoning**. It was pure pattern matching — search, fetch, read PDF, extract text, fill schema.

The 13 courts where Mini diverged from Sonnet are likely cases where reasoning would help:
- Picking the right PDF when multiple are available
- Falling back to page-text when PDF content is ambiguous
- Handling legacy sites (Besançon returned a 2013 date)

## GPT-5.4 Mini effort levels

| Level | Available | Behaviour |
|---|---|---|
| `none` | Yes (default) | No thinking. Pattern match. Fastest/cheapest. |
| `low` | Yes | Minimal thinking. |
| `medium` | Yes | Moderate reasoning. |
| `high` | Yes (max for Mini) | Full reasoning. Still no `xhigh`. |

Even at `high`, Mini is ~7x cheaper than Sonnet ($0.10 vs $0.70 per court).

## Next test

Running divergent courts with `reasoning.effort: "medium"` to see if accuracy improves while staying cost-effective.
