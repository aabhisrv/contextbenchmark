<!-- spiderbrain:start v=1 fp=d5f0eebf1335937a commit=fadac7bc649c -->
## Repo understanding (SpiderBrain)

This repo carries a committed brain in `.spiderbrain/`: a deterministic, source-free map of its
structure, dependencies, and blast radius (42 files, 30 edges). Consult it before
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
- corpora/micro-app/src/catalog/products.ts  (reaches 3 files)
- lib/fingerprint.mjs  (reaches 2 files)
- site/src/canonical.js  (reaches 2 files)
- corpora/micro-app/src/auth/session.ts  (reaches 1 files)

The why (decisions, reasoning, always-fresh scores) is the cloud layer. Set SPIDERBRAIN_API_KEY
(get one at https://spiderbrain.ai/dashboard?tab=keys) and any command above also returns fresh
scores, semantic search, and `why <path>` (the decision behind a file).

Deterministic: regenerates byte-identically from commit fadac7bc649c (fingerprint d5f0eebf1335937a). Do not hand-edit between the markers.
<!-- spiderbrain:end -->
