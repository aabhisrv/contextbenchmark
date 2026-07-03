# Contributing to contextbenchmark

The benchmark is only credible if it is fair, runnable by anyone, and adversarial to everyone — including its authors.

## What we want most
1. **Adapters** for real systems (vector stores, memory APIs, RAG frameworks, context engines) — see `adapters/ADAPTER.md`. Configure the system as it ships; benchmark-only determinism flags are misrepresentation and will be rejected.
2. **Corpora**: pinned real-repo corpora (exact SHA fetch scripts, not committed source) and larger synthetic tiers.
3. **Family proposals**: new determinism families (e.g. determinism-under-incremental-update) with a precise method + metric, opened as an issue before a PR.
4. **Refutations**: if a published fingerprint doesn't reproduce for you, open an issue with your fingerprint attached — that is the benchmark working as intended.

## Ground rules
- Metrics changes require an issue first (they invalidate published levels).
- Every PR must keep `node contextbenchmark.mjs run --adapters bm25` green on all three OSes (CI enforces).
- Results in PRs/issues must follow the disclosure standard in the README (fingerprints or it didn't happen).
