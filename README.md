# contextbenchmark

**The open benchmark for measuring the reliability, reproducibility, and determinism of AI context systems.** Compare context engines with transparent metrics, reproducible tests, and vendor-neutral results.

🌐 [contextbenchmark.com](https://contextbenchmark.com) · ![cross-machine-identity](https://github.com/aabhisrv/contextbenchmark/actions/workflows/cross-machine.yml/badge.svg)

Measures whether an AI system's *context layer* gives the same answer twice: Rebuild-identity, query-stability, drift-under-noise, and cross-machine identity for retrieval indexes, code-context engines, RAG pipelines, and agent-memory systems — with a graded standard (Determinism Levels **D0–D4**) and a verifiable fingerprint format anyone can check.

> Your agent's answers cannot be reproducible, auditable, or debuggable if the context it reads is different every time. Model inference gets the blame for nondeterminism; the context layer is where determinism is actually *achievable today* — and where almost nobody measures it.

---

## What this is — and explicitly is not

**In scope: the context layer.** Everything between a corpus and the ranked context handed to a model: index/graph construction, chunking, embedding, scoring, ranking, retrieval.

**Out of scope: LLM inference nondeterminism.** Temperature-0 sampling still produces divergent outputs due to batching and floating-point reduction order — that is a *model-serving* problem with its own active literature and fixes (batch-invariant kernels). contextbenchmark deliberately does not touch it, and results here make **no claim** about end-to-end agent determinism. Conflating the two layers is the fastest way to make determinism claims meaningless; this benchmark exists to keep them separate.

| Layer | Nondeterminism source | Measured by |
|---|---|---|
| Model inference | batching, FP reduction order, sampling | **not contextbenchmark** (see prior art below) |
| **Context (this benchmark)** | index build order, ANN structure randomness, FP embedding drift, unstable tie-breaks, LLM-based extraction pipelines | **contextbenchmark** |

## The four test families

| Family | Question it answers | Method | Metrics |
|---|---|---|---|
| **Rebuild-Identity (RI)** | Same corpus → is the built artifact *byte-identical* across fresh builds? | R independent builds, artifact hash comparison | distinct-hash count over R |
| **Query-Stability (QS)** | Same artifact + same query → identical ranked context, every time? | T trials per query on one build | Exact-Match Rate, mean pairwise Jaccard@k, Kendall τ |
| **Drift-Under-Noise (DN)** | One *irrelevant* file lands in the corpus → how much do answers to unrelated queries move? | inject a semantically unrelated document, rebuild, compare per-query results vs base | mean Jaccard@k vs base, noise-in-top-k count, drift score = 1 − Jaccard |
| **Cross-Machine Identity (CM)** | Different OS/hardware, same version + corpus → same artifact and answers? | fingerprint exchange (`contextbenchmark compare`), CI cross-OS matrix | artifact hash match + per-query result hash matches |

## Determinism Levels — the standard

| Level | Name | Requirement |
|---|---|---|
| **D4** | Portable-deterministic | D3 **and** cross-machine fingerprint match (artifact + all query results) on a different OS/arch |
| **D3** | Machine-deterministic | byte-identical artifacts across rebuilds **and** EMR = 1.0 on query trials |
| **D2** | Semantically deterministic | artifact bytes differ, but ranked results identical (EMR = 1.0) |
| **D1** | Rank-stable | results not identical; mean Jaccard@k ≥ 0.9 **and** τ ≥ 0.9 |
| **D0** | Nondeterministic | below D1 |

Drift-Under-Noise is reported alongside the level as an orthogonal score (a system can be perfectly deterministic *and* hypersensitive to irrelevant input — both facts matter).

## Quick start

```bash
git clone <this repo> && cd contextbenchmark
npm install                       # only needed for the emb-minilm adapter

# run the reference baseline (no dependencies)
node contextbenchmark.mjs run --adapters bm25

# run everything available on this machine
node contextbenchmark.mjs run --adapters bm25,emb-minilm,spiderbrain --rebuilds 3 --trials 5

# cross-machine: run on two machines, then
node contextbenchmark.mjs compare results/<A>.fingerprint.json results/<B>.fingerprint.json
```

## Current results (micro-app corpus, win32-x64, node 24)

| Adapter | Rebuild-Identity | Query-Stability (EMR) | Drift-Under-Noise | Level |
|---|---|---|---|---|
| `bm25` (lexical reference) | PASS (1 hash / 3 builds) | 1.0 | 0.04 — noise reached top-10 in 2/10 queries (WARN) | **D4** ✓ CI-verified |
| `spiderbrain` (structural code-context engine) | PASS (1 hash / 3 builds) | 1.0 | **0.00 — noise never surfaced (PASS)** | **D3** |
| `emb-minilm` (chunk-embedding RAG reference) | *pending on this machine* | — | — | — |

Two early, honest observations:
- **The bar is reachable**: a plainly-engineered lexical retriever hits D3. Systems scoring below the free baseline on *determinism* have made a design choice, not hit a law of nature.
- **Drift separates architectures**: BM25's global IDF statistics shift when any document lands (noise leaked into unrelated top-10s); a structural dependency-graph engine ignored the unconnected file entirely. Embedding indexes and LLM-extraction memory pipelines are expected to sit between and below — run them and see.
- **D4 is the real test — and it is verified live**: this repo's CI matrix builds fingerprints on ubuntu/windows/macos and compares every pair on each push. Run #1 verified bm25 at D4 (artifact hashes identical, 10/10 query results identical across all three OS pairs). The spiderbrain adapter's D4 run is pending CI-runnable packaging (its fingerprints are published for independent comparison meanwhile).

## Adapters

An adapter is ~40 lines implementing three exports (see [`adapters/ADAPTER.md`](adapters/ADAPTER.md)):

```js
export const name = 'my-system';
export async function build(corpusDir, outDir) { /* write the FULL artifact into outDir */ }
export async function query(outDir, queryText, k) { /* return [{file, score}] ranked */ }
// optional: export const artifactFile = 'index.bin'  // hash this file instead of the whole dir
// optional: export function available() { ... }      // skip gracefully when deps are missing
```

Shipped adapters:
- **`bm25`** — dependency-free lexical index. The determinism floor: if you can't beat this baseline's D-level, say why.
- **`emb-minilm`** — MiniLM chunk embeddings with exhaustive search (the determinism-*friendliest* RAG configuration; ANN-indexed deployments are usually worse). Requires `@xenova/transformers`.
- **`spiderbrain`** — deterministic code-context engine (dependency graph + frozen-clock scoring). Requires a local Spiderbrain installation (`SPIDERBRAIN_ENGINE` env); public CLI planned. Its results remain verifiable by anyone through the fingerprint format.

**Vendors and researchers: adapters for your system are welcome.** Mem0, Zep, Supermemory, LlamaIndex, vector databases — the contract is deliberately tiny, and `available()` lets adapters skip on machines without credentials. The benchmark is only interesting if it's fair; PRs that make an adapter unrepresentative of the real system will be rejected.

## Corpora

- `corpora/micro-app` — committed, deterministic 12-file TypeScript fixture (layered webshop) + 10 queries. License-clean, tiny, runs in seconds.
- Larger pinned real-repo corpora (fetched at exact SHAs, not committed) are planned; see CONTRIBUTING.

## Fingerprint format (cross-machine protocol)

`contextbenchmark run` emits `results/<adapter>.<corpus>.<platform>-<arch>.fingerprint.json`:

```json
{
  "contextbenchmarkFingerprint": 1,
  "adapter": "bm25", "corpus": "micro-app", "k": 10,
  "env": { "os": "win32 10.0.19045", "arch": "x64", "node": "v24.14.0" },
  "artifactHash": "sha256…",
  "queryHashes": { "<query>": "sha256 of the ranked file list", "…": "…" }
}
```

Fingerprints are small, shareable, and independently verifiable: publish yours with results, and anyone can `compare` against their own run. **A determinism claim without a fingerprint is marketing.**

## Metric definitions

- **Exact-Match Rate (EMR)** — fraction of trials whose ranked file list is identical to the first trial's.
- **Jaccard@k** — set overlap of top-k files between two runs; reported as the mean over all trial pairs (QS) or vs the base run (DN).
- **Kendall τ (tau-a)** — rank-order agreement over the intersection of two lists.
- **Drift score** — 1 − mean Jaccard@k between base and noise-injected corpus results, over queries unrelated to the noise.
- **Artifact hash** — SHA-256 of the adapter's declared artifact file, or of the full output directory (sorted-path, content-chained).

EMR/Jaccard/τ follow the reproducibility-measurement conventions established for RAG systems by ReproRAG (below).

## Prior art & positioning

- **ReproRAG** — *On the Reproducibility Limitations of RAG Systems* (arXiv:2509.18869): the closest prior work; measures run-to-run variance of vector retrieval (embedding choice, FP precision, index type, distribution). contextbenchmark differs in being a *product-grade pass/fail benchmark* with byte-level artifact identity, rebuild and cross-machine families, drift-under-noise, a level standard, and a verifiable exchange format.
- **LLM inference nondeterminism** — arXiv:2408.04667 (*Non-Determinism of "Deterministic" LLM Settings*) and Thinking Machines' batch-invariant kernels work: the model-layer problem contextbenchmark deliberately fences off.
- **ContextBench** (arXiv:2602.05892) — an academic benchmark for context-retrieval *accuracy* in coding agents; the accuracy lane. contextbenchmark is the determinism/reliability lane, is not affiliated with ContextBench, and the two are complementary — run both.
- **Reproducible Builds / hermetic build verification** — the cultural ancestor: bit-by-bit artifact identity as the trust primitive, applied here to AI context artifacts.

## Results disclosure standard

A publishable contextbenchmark result includes: (1) the JSON report, (2) fingerprints per adapter, (3) exact adapter + system versions, (4) corpus name + SHA, (5) machine spec, (6) any deviation from default parameters. Reports missing fingerprints should not be trusted — including ours.

## Roadmap

- [ ] Cross-OS CI matrix publishing reference fingerprints per release (D4 verification)
- [ ] Pinned real-repo corpora (zod, hono at exact SHAs) + scale tiers
- [ ] Adapters: HNSW-configured vector store (expected D1-D2), LLM-extraction memory pipeline (expected D0-D1), hosted memory APIs (Mem0/Zep/Supermemory — vendor PRs welcome)
- [ ] Provenance: signed fingerprints
- [ ] Determinism-under-update family (incremental index updates vs full rebuilds)

## License

MIT (see LICENSE). The benchmark, metrics, levels, and fingerprint format are open by design — a determinism standard only matters if anyone can run it, extend it, and hold everyone (including us) to it.
