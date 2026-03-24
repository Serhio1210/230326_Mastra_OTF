# Besançon Trace Analysis: Why It Fails and Succeeds

**Date**: 2026-03-24 23:00 UTC

---

## The data is there

The modern site `cours-appel.justice.fr/besancon/experts-judiciaires` returns:
- Page text: `"mise à jour : 24/02/2026"`
- PDF link: `Annuaire des experts - 2026` → `/sites/default/files/2026-02/Annuaire%20experts%202026.pdf`
- PDF content: `"LISTE DES EXPERTS POUR 2026"` (no exact date inside)

**Ground truth: `2026-02-24`** from page text.

## Successful run: Mini, effort=none — 3 turns, 9.3s

```
Turn 0: fetchPage(cours-appel.justice.fr/besancon/experts-judiciaires)
        → Title: "Experts judiciaires | Cour d'appel de Besançon"
        → PDF: "Annuaire des experts - 2026"
        → Date hint: "mise à jour : 24/02/2026"

Turn 1: extractPdfDate(Annuaire experts 2026.pdf)
        → 137 pages, text: "LISTE DES EXPERTS POUR 2026" (no exact date)

Turn 2: 💬 Agent says: page date 24/02/2026 is more specific than year-only in PDF
        → Picks 2026-02-24 ✓
```

**Result: `2026-02-24` (page-text) — correct.**

## Failing run: Full, effort=low — 8 turns, 112s

```
Turn 0: 🔍 web_search, 🔍 web_search, fetchPage(www.cours-appel.justice.fr)
        ← fetched the HOMEPAGE, not /besancon/experts-judiciaires

Turn 1: 🔍🔍🔍, fetchPage(www.ca-besancon.justice.fr)
        ← fell to legacy site

Turn 2: 🔍, fetchPage(www.ca-besancon.justice.fr)
        ← still on legacy

Turn 3-6: 🔍🔍🔍🔍🔍, fetchPage(ca-besancon), extractPdfDate(ca-besancon)
        ← spiral of web searches on legacy site

Turn 7: 💬 Agent picks 2025-05-19 from legacy site
```

**Result: `2025-05-19` (page-text) — wrong, from legacy site.**

## Root cause

The difference between success and failure is whether the agent uses web search:

| | No web search (effort=none) | With web search (effort=low) |
|---|---|---|
| First action | fetchPage on deep URL directly | web_search → gets domain root |
| URL fetched | `/besancon/experts-judiciaires` | `/` (homepage) |
| Found date? | Yes — "mise à jour : 24/02/2026" | No — homepage has no expert data |
| Fallback | None needed | Spirals to legacy ca-besancon.justice.fr |
| Result | ✓ 2026-02-24 | ✗ 2025-05-19 |

**The irony:** our instruction "ALWAYS start with a web search" hurts Besançon because web search doesn't surface the deep link (`/besancon/experts-judiciaires`). It returns the domain root. The agent with `effort=none` skips the search, goes directly to the right URL, and wins.

## This is a search result quality problem

The OpenAI web search tool doesn't reliably return deep page URLs for Besançon. It returns `cours-appel.justice.fr` (the root) or `ca-besancon.justice.fr` (legacy), but not the specific experts page. Once the agent lands on the homepage, there are no expert PDF links, so it falls back to legacy.

## Implication

For most courts, "always web search first" works because web search returns the right deep link. Besançon is an edge case where the search engine fails to surface the subpage. The fix isn't in instructions — it's either:
1. Accept that `effort=none` (which skips search and guesses URLs) happens to work for Besançon but isn't reliable in general
2. Accept Besançon as a known flaky court that depends on search result quality
3. Use `allowed_domains` to keep the agent on justice.fr, reducing the spiral but not fixing the deep link problem
