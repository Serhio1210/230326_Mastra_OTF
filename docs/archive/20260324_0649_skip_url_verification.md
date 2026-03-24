# Decision: Skip URL Verification Tool (Phase 2)

**Date**: 2026-03-24 06:49 UTC

---

## What it would do

A `verifyUrl` tool that makes HEAD requests to check HTTP 200 + content-type.

## Why we're skipping it

Anthropic's `web_search_20260209` already fetches and reads pages before returning results. If the agent found a URL, it was live seconds ago. There is no stale data problem.

The reference project (`290126__Assertra`) needs URL verification because it **stores results in a database and re-checks 36 courts periodically**. URLs that worked last month may be broken today.

Our agent searches and returns in one shot — no storage, no staleness.

## Schema impact

Removed `pageVerified` and `documentVerified` from the structured output schema. They were always `false` (placeholder) and added noise to the output.

## When to reconsider

If we add database storage or periodic batch checking (Phase 5+), URL verification becomes useful again.
