# Besançon Root Cause: Agent Skipped Web Search

**Date**: 2026-03-24 14:45 UTC

---

## The problem

Besançon returned dates ranging from 2013 to null across runs.

## Debug trace (Step 0)

```
Step 0: fetchPage("https://cours-appel.justice.fr/besancon/experts-judiciaires") → FAIL
```

The agent went **straight to fetchPage with a guessed URL** — before any web search. It constructed the URL from the pattern in our instructions (`cours-appel.justice.fr/[city]/...`) and skipped the search.

The guessed URL was missing `www.` — `cours-appel.justice.fr` doesn't connect, but `www.cours-appel.justice.fr` does.

## Root cause

Our instructions said:

> "ALWAYS try the modern site first: cours-appel.justice.fr/[city]/..."

The agent interpreted this as "I know the URL pattern, I'll go directly." It was being efficient — why search when you know the URL?

But the pattern was wrong (missing `www.`), and even if it weren't, courts change their URL paths. The whole point of web search is to find the **current, verified** URL.

## Fix

Removed URL patterns from instructions. New text:

> "ALWAYS start with a web search. Never guess or construct URLs yourself. Use the URLs returned by the search engine — they are verified and current."

## Result

Besançon now consistently returns `2026-02-24` (page-text) — correct.

## Lesson

Don't teach an agent URL patterns. It will use them to skip the discovery step. Let the search engine do discovery — that's what it's for.

## Missing: observability

We debugged this by writing a custom script that logged every step. With Mastra observability, we would have seen immediately:
- Step 0 was fetchPage (not web search)
- The URL was `cours-appel.justice.fr` (no www)
- Connection failed
- Agent then tried legacy sites instead of adding www

This took 30 minutes to diagnose. With tracing, it would have taken 30 seconds.
