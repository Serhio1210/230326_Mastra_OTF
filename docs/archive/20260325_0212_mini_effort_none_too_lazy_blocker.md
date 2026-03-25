# Blocker: Mini effort:none Too Lazy — Agent Gives Up After 2 Turns

**Date**: 2026-03-25 02:12 UTC

---

## What happened

10-court run with `allowed_domains` filter. 4/10 courts failed or returned wrong data:

| Court | Result | Expected | Turns | Issue |
|---|---|---|---|---|
| Besançon | null (not-found) | 2026-02-24 | **2** | Agent gave up immediately |
| Aix-en-Provence | null (not-found) | 2025-12-10 | **2** | Agent gave up immediately |
| Paris | 2026-01-01 | 2026-03-10 | 3 | Found old PDF, didn't try harder |
| Amiens | 2022-12-05 | ~2026-02 | 3 | Found old decree date, didn't look further |

Besançon and Aix completed in only 2 turns — the agent decided "I can't find it" after a single search and stopped. Paris and Amiens found something but didn't persist to find the most recent PDF.

**Note**: Besançon worked 3/3 in the previous isolated test but failed here in the concurrent batch. The non-determinism persists.

## Root cause

GPT-5.4 Mini at `effort: none` has **zero reasoning**. It pattern-matches and takes the path of least resistance. When the first search doesn't return an obvious result, it gives up instead of trying different queries.

The worktree proved this: with `effort: medium` on the agent step, Mini persists — tries different queries, follows up on partial results, and achieves 9/10 agreement.

## The Mastra blocker

We can't use `effort > none` on the agent step through Mastra because of the **parallel tool + reasoning bug**:

```
web_search_call was provided without its required 'reasoning' item
```

When reasoning is enabled, OpenAI's Responses API generates a `reasoning` item before each `web_search_call`. The AI SDK (`@ai-sdk/openai`) strips these reasoning items when constructing multi-turn messages. This works at `effort: none` (no reasoning items) but crashes at any higher effort.

**The native OpenAI SDK doesn't have this bug** — it preserves reasoning items in the conversation history by passing all output items back as input.

## Two paths forward

### Path A: Native SDK for the agent step
Use the worktree's `runCourtSearchNative` for the agent loop (effort: medium, no bug), then use Mastra/AI SDK for the extraction step.

**Pro**: Proven to work (9/10 in worktree)
**Con**: Bypasses Mastra for the core agent loop

### Path B: GPT-5.4 full with low effort through Mastra
GPT-5.4 full at `effort: low` persists more than Mini at `none` — it was the worktree's best config (9/10 agreement, $0.059/court).

**Pro**: Stays within Mastra
**Con**: 2x cost vs Mini, and the parallel tool bug may still apply at `effort: low`

### Path C: Wait for AI SDK fix
The reasoning + parallel tool bug is tracked in Mastra GitHub #11103. Once fixed, Mini with `effort: medium` through Mastra would work.

**Pro**: Best long-term solution
**Con**: Unknown timeline

---

## Current best results by config

| Config | Where | Agreement | Cost/court | Blocker |
|---|---|---|---|---|
| Mini none + allowed_domains | Main branch (Mastra) | 6/10 | $0.024 | Agent too lazy |
| Mini medium + allowed_domains | Worktree (native SDK) | 9/10 | $0.027 | Can't run through Mastra |
| Full low/low + allowed_domains | Worktree (native SDK) | 9/10 | $0.059 | Untested through Mastra |
| Full low/low + allowed_domains | Main branch (test 25, prepared) | ? | ~$0.059 | Not yet run |
