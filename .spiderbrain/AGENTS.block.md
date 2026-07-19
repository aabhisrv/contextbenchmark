<!-- spiderbrain:start v=1 fp=667821695e6b8238 commit=6a37c2abded9 -->
## Repo understanding (SpiderBrain)

This repo carries a committed brain in `.spiderbrain/`: a deterministic, source-free map of its
structure, dependencies, and blast radius (53 files, 43 edges). Consult it before
reading files, to know what matters and what a change reaches.

Fastest use (an MCP server for this repo, no SpiderBrain install, no account):
    npx spiderbrain mcp
One-off:
    npx spiderbrain blast <path>     # what a change to <path> reaches
    npx spiderbrain keystones        # the load-bearing files

Keystones (top by reach, precomputed so you get value without installing anything):
- corpora/micro-app/src/shared/config.ts  (reaches 9 files)
- corpora/micro-app/src/shared/http.ts  (reaches 7 files)
- corpora/micro-app/src/shared/events.ts  (reaches 4 files)
- lib/metrics.mjs  (reaches 4 files)
- benchmarks/impact-closure/lib/answer.mjs  (reaches 3 files)
- benchmarks/impact-closure/lib/manifest.mjs  (reaches 3 files)
- benchmarks/impact-closure/lib/run-record.mjs  (reaches 3 files)
- benchmarks/impact-closure/lib/scoring.mjs  (reaches 3 files)

The why (decisions, reasoning, always-fresh scores) is the cloud layer. Set SPIDERBRAIN_API_KEY
(get one at https://spiderbrain.ai/dashboard?tab=keys) and any command above also returns fresh
scores, semantic search, and `why <path>` (the decision behind a file).

Deterministic: regenerates byte-identically from commit 6a37c2abded9 (fingerprint 667821695e6b8238). Do not hand-edit between the markers.
<!-- spiderbrain:end -->
