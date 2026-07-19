# contextbenchmark

**The open benchmark for measuring the reliability, reproducibility, and determinism of AI context systems.** Compare context engines with transparent metrics, reproducible tests, and vendor-neutral results.

🌐 [contextbenchmark.com](https://contextbenchmark.com) · ![cross-machine-identity](https://github.com/aabhisrv/contextbenchmark/actions/workflows/cross-machine.yml/badge.svg)

Measures whether an AI system's *context layer* gives the same answer twice. Rebuild-identity, query-stability, drift-under-noise, and cross-machine identity for retrieval indexes, code-context engines, RAG pipelines, and agent-memory systems, with a graded standard (**Context Trust Levels (CTL 0-4)**) and a verifiable fingerprint format anyone can check.

> Your agent's answers cannot be reproducible, auditable, or debuggable if the context it reads is different every time. Model inference gets the blame for nondeterminism. The context layer is where determinism is actually *achievable today*, and where almost nobody measures it.

---

## What this is (and explicitly is not)

**In scope: the context layer.** Everything between a corpus and the ranked context handed to a model: index/graph construction, chunking, embedding, scoring, ranking, retrieval.

**Out of scope: LLM inference nondeterminism.** Temperature-0 sampling still produces divergent outputs due to batching and floating-point reduction order. That is a *model-serving* problem with its own active literature and fixes (batch-invariant kernels). contextbenchmark deliberately does not touch it, and results here make **no claim** about end-to-end agent determinism. Conflating the two layers is the fastest way to make determinism claims meaningless; this benchmark exists to keep them separate.

| Layer | Nondeterminism source | Measured by |
|---|---|---|
| Model inference | batching, FP reduction order, sampling | **not contextbenchmark** (see prior art below) |
| **Context (this benchmark)** | index build order, ANN structure randomness, FP embedding drift, unstable tie-breaks, LLM-based extraction pipelines | **contextbenchmark** |

## The four test families

| Family | Question it answers | Method | Metrics |
|---|---|---|---|
| **Rebuild-Identity (RI)** | Same corpus, is the built artifact *byte-identical* across fresh builds? | R independent builds, artifact hash comparison | distinct-hash count over R |
| **Query-Stability (QS)** | Same artifact plus same query, identical ranked context every time? | T trials per query on one build | Exact-Match Rate, mean pairwise Jaccard@k, Kendall tau |
| **Drift-Under-Noise (DN)** | One *irrelevant* file lands in the corpus, how much do answers to unrelated queries move? | inject a semantically unrelated document, rebuild, compare per-query results vs base | mean Jaccard@k vs base, noise-in-top-k count, drift score = 1 minus Jaccard |
| **Cross-Machine Identity (CM)** | Different OS or hardware, same version plus corpus, same artifact and answers? | fingerprint exchange (`contextbenchmark compare`), CI cross-OS matrix | artifact hash match plus per-query result hash matches |

## Context Trust Levels: the standard

| Level | Name | Requirement |
|---|---|---|
| **CTL-4** | Cross-machine deterministic | CTL-3 **and** cross-machine fingerprint match (artifact + all query results) on a different OS/arch |
| **CTL-3** | Machine-deterministic | byte-identical artifacts across rebuilds **and** EMR = 1.0 on query trials |
| **CTL-2** | Stable retrieval | artifact bytes differ, but ranked results identical (EMR = 1.0) |
| **CTL-1** | Repeatable locally | results not identical; mean Jaccard@k >= 0.9 **and** tau >= 0.9 |
| **CTL-0** | Non-repeatable | below CTL-1 |

Drift-Under-Noise is reported alongside the level as an orthogonal score. A system can be perfectly deterministic *and* hypersensitive to irrelevant input; both facts matter.

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

## Current results (micro-app corpus, win32-x64, node 24, re-verified 2026-07-17)

| Adapter | Rebuild-Identity | Query-Stability (EMR) | Drift-Under-Noise | Level |
|---|---|---|---|---|
| `spiderbrain` (structural code-context engine) | PASS (1 hash / 3 builds) | 1.0 | **0.00, noise never surfaced in 0/10 queries (PASS)** | **CTL-3** |
| `bm25` (lexical reference) | PASS (1 hash / 3 builds) | 1.0 | 0.04, noise reached top-10 in 2/10 queries (WARN) | **CTL-4** verified in CI |
| `emb-minilm` (exhaustive-search embedding RAG reference) | PASS (1 hash / 2 builds) | 1.0 | 0.16, noise reached top-10 in 9/10 queries (WARN) | **CTL-3** |

**Re-verification, 2026-07-17.** These results were first published on 2026-07-05 and re-run against the same corpus 12 days later. `bm25` and `emb-minilm` rebuilt **byte-identical** artifacts, which is exactly what their levels are supposed to mean. The `spiderbrain` artifact hash did not reproduce, and isolation testing (identical corpus bytes, identical embedded clock, identical absolute path) proved three independent inputs move that artifact: the **git HEAD commit time of the repository enclosing the scanned project**, the **absolute path** of the project, and the engine version. The first two are reproducibility defects in the engine's artifact serialization: the artifact of record embeds environment rather than content. They were found by this benchmark doing its job on its author's own product, and are logged with the engine for a fix. All 10 query result hashes were identical under every condition, so retrieval behaviour and every number in the table are unchanged, but until the fix lands the spiderbrain artifact hash is only recomputable at the stated benchmark-repo commit on the build machine, and its CTL-3 byte-identity holds within a repository state, not across commits or clones. An earlier version of this paragraph blamed the engine update alone; that claim predated the isolation tests and was wrong. Fingerprint format 2 (below) now records system identity, corpus hash, and benchmark version precisely so a mismatch like this is attributable instead of a mystery.

**Resolution, 2026-07-17 (the same day).** Both serialization defects are fixed in the engine: `generatedAt` and the absolute project path moved out of the artifact of record into a `buildinfo.json` sidecar, and the git-time collection was scoped to the scanned subtree so a commit elsewhere in an enclosing repository can no longer move the artifact. The fix work also found and removed two couplings the isolation tests had not surfaced: a filesystem-mtime fallback (clone-varying) and a wall-clock read in the engine's incident-decay scoring (build-date-varying). The engine's own CI now locks artifact invariance across unrelated commits, clone paths, and no-git copies. On the benchmark side, the spiderbrain adapter now stages the corpus into a git-free temporary copy before building, so the artifact of record is a pure function of corpus bytes — the identity this benchmark's `corpus.hash` actually pins — and a GitHub tarball download computes the same fingerprint as a git clone. The republished fingerprint was verified by recomputing it from a second location: artifact hash identical, `compare` verdict PASS (CTL-4-eligible). Cross-OS CTL 4 still awaits CI-runnable packaging of the engine. One operational requirement stands for any corpus used for byte-identity: line endings must be pinned (this repo's `.gitattributes` does so), because CRLF and LF checkouts are different bytes and are treated as such.

**Field note, 2026-07-19: the contract held under refactoring.** Two days after the resolution above, the engine went through a deliberately heavy day of internal change, deployed to production in four stages: three separate scoring code paths were unified into one shared scorer, output leak guards were hardened, and cloud ingest changed from shallow single-commit clones to full-history clones. Across five production parses of the same public reference repository (`benjaminp/six`, commit `c8e3940`) spanning all four deploys, the published structural fingerprint stayed identical: `9fb6e364e9c1fe49`. The scored layer grew from 7 to 16 per-node fields; the fingerprinted structure never moved. That is the separation the fingerprint contract promises: the artifact is a function of the corpus and the declared contract, not of engine internals. The engine's internal CI now runs 45 determinism and contract gates, including artifact-invariance (unrelated commits, paths, mtimes) and a scorer-unification gate that fails if any scoring path drifts from the shared one. It has stayed identical through every production deploy since, including a cloud-parse API that added authenticated, metered parsing of a repository into a hosted brain: a new feature and a new authenticated surface, and still the same structural fingerprint for the same commit. Disclosure: this is an operator-reported observation from our own engine's production API, not an independently reproduced benchmark run, and the trust levels in the table are unchanged by it.

Three honest observations:
- **The bar is reachable.** A plainly-engineered lexical retriever hits CTL-4. Systems scoring below the free baseline on *determinism* have made a design choice, not hit a law of nature.
- **Drift separates architectures cleanly.** A structural dependency graph (spiderbrain) ignored a file nothing depends on. A lexical index (bm25) leaked the new file into 2 of 10 unrelated result sets, because global term statistics shift slightly whenever a document is added. An exhaustive-search embedding index (emb-minilm), the most determinism-friendly RAG configuration possible, leaked the new file into 9 of 10 unrelated result sets, because a single new document reshapes a shared vector space. Production ANN-indexed embedding stores are expected to do worse, not better, since they trade determinism for speed.
- **CTL-4 is the real test, and it is verified live.** This repo's CI matrix builds fingerprints on ubuntu, windows, and macos and compares every pair on each push. Run #1 verified bm25 at CTL-4: artifact hashes identical, 10 of 10 query results identical across all three OS pairs. The spiderbrain adapter's CTL-4 run is pending CI-runnable packaging; its fingerprints are published for independent comparison meanwhile.

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
- **`bm25`**: dependency-free lexical index. The determinism floor: if you can't beat this baseline's CTL, say why.
- **`emb-minilm`**: MiniLM chunk embeddings with exhaustive search (the determinism-*friendliest* RAG configuration; ANN-indexed deployments are usually worse). Requires `@xenova/transformers`.
- **`spiderbrain`**: deterministic code-context engine (dependency graph plus frozen-clock scoring). Requires a local Spiderbrain installation (`SPIDERBRAIN_ENGINE` env); public CLI planned. Its results remain verifiable by anyone through the fingerprint format.

**Vendors and researchers: adapters for your system are welcome.** Mem0, Zep, Supermemory, LlamaIndex, vector databases: the contract is deliberately tiny, and `available()` lets adapters skip on machines without credentials. The benchmark is only interesting if it's fair; PRs that make an adapter unrepresentative of the real system will be rejected.

## Corpora

- `corpora/micro-app`: committed, deterministic 12-file TypeScript fixture (layered webshop) plus 10 queries. License-clean, tiny, runs in seconds.
- Larger pinned real-repo corpora (fetched at exact SHAs, not committed) are planned; see CONTRIBUTING.

## Fingerprint format (cross-machine protocol)

`contextbenchmark run` emits `results/<adapter>.<corpus>.<platform>-<arch>.fingerprint.json`. Format 2 (2026-07-17) records the controlled variables of the experiment, not just the independent one:

```json
{
  "contextbenchmarkFingerprint": 2,
  "benchmarkVersion": "0.1.0",
  "adapter": "bm25",
  "system": { "id": "sha256:8685c22bb69f6eb9", "source": "content-hash" },
  "corpus": { "name": "micro-app", "hash": "sha256 of the corpus tree" },
  "k": 10,
  "env": { "os": "win32 10.0.19045", "arch": "x64", "node": "v24.14.0" },
  "artifactHash": "sha256…",
  "queryHashes": { "<query>": "sha256 of the ranked file list", "…": "…" }
}
```

Everything above `env` is a controlled variable and must match for a comparison to mean anything; `env` is the independent variable that Cross-Machine Identity deliberately varies. `system` comes from the adapter's optional `version()` export (see [`adapters/ADAPTER.md`](adapters/ADAPTER.md)). `compare` outcomes:

| Outcome | Meaning | Exit |
|---|---|---|
| `PASS` | identical artifact + query results (append `(UNVERIFIED)` when identity was undeclared) | 0 |
| `FAIL` | results differ and the inputs are provably identical: the system is nondeterministic | 1 |
| `NOT COMPARABLE` | a controlled variable provably differs | 2 |
| `INCONCLUSIVE` | results differ but an input is unattributable: a changed system produces the same signature as nondeterminism, so no verdict is honest | 3 |

Format 1 fingerprints remain readable and compare as unattributed. The distinction exists because we hit it ourselves: the 2026-07-17 re-verification saw spiderbrain's artifact hash move and format 1 could only call it FAIL, which was the wrong verdict for what turned out to be environment leaking into the artifact.

Fingerprints are small, shareable, and independently verifiable: publish yours with results, and anyone can `compare` against their own run. **A determinism claim without a fingerprint is marketing.**

## Metric definitions

- **Exact-Match Rate (EMR)**: fraction of trials whose ranked file list is identical to the first trial's.
- **Jaccard@k**: set overlap of top-k files between two runs; reported as the mean over all trial pairs (QS) or vs the base run (DN).
- **Kendall tau (tau-a)**: rank-order agreement over the intersection of two lists.
- **Drift score**: 1 minus mean Jaccard@k between base and noise-injected corpus results, over queries unrelated to the noise.
- **Artifact hash**: SHA-256 of the adapter's declared artifact file, or of the full output directory (sorted-path, content-chained).

EMR/Jaccard/τ follow the reproducibility-measurement conventions established for RAG systems by ReproRAG (below).

## Prior art & positioning

- **ReproRAG**: *On the Reproducibility Limitations of RAG Systems* (arXiv:2509.18869). The closest prior work; measures run-to-run variance of vector retrieval (embedding choice, FP precision, index type, distribution). contextbenchmark differs in being a *product-grade pass/fail benchmark* with byte-level artifact identity, rebuild and cross-machine families, drift-under-noise, a level standard, and a verifiable exchange format.
- **LLM inference nondeterminism**: arXiv:2408.04667 (*Non-Determinism of "Deterministic" LLM Settings*) and Thinking Machines' batch-invariant kernels work. The model-layer problem contextbenchmark deliberately fences off.
- **ContextBench** (arXiv:2602.05892): an academic benchmark for context-retrieval *accuracy* in coding agents, the accuracy lane. contextbenchmark is the determinism and reliability lane, is not affiliated with ContextBench, and the two are complementary. Run both.
- **STATE-Bench** (Microsoft, 2026): a reproducible, open benchmark for agent *memory*, reporting reliability as `pass^5` (the share of tasks succeeding on all five runs). The nearest neighbour, one layer up: it asks whether the **agent** succeeds repeatably end to end, which folds model, tools, and memory into a single number. contextbenchmark asks whether the **context artifact and its ranked results** are byte-identical, with no model in the loop. Unaffiliated; a system can pass one and fail the other, which is the reason to measure both.
- **Context-Bench** (Letta) and **context-bench** (opactorai): unaffiliated projects with near-identical names. The former benchmarks how well *language models* perform agentic context engineering; the latter measures how accurately *MCP servers* supply context. Neither measures reproducibility.
- **Reproducible Builds / hermetic build verification**: the cultural ancestor. Bit-by-bit artifact identity as the trust primitive, applied here to AI context artifacts.
- **General AI-benchmark catalogs** (for example [awesome-ai-benchmarks](https://github.com/panilya/awesome-ai-benchmarks), 114+ benchmarks across 24 subcategories): as of this writing, none list a dedicated determinism or reproducibility category for context/RAG/agent-memory systems. The closest existing entries evaluate episodic-memory *capability*, not reproducibility. contextbenchmark is a candidate first entry for that gap.

## Results disclosure standard

A publishable contextbenchmark result includes: (1) the JSON report, (2) fingerprints per adapter, (3) exact adapter and system versions, (4) corpus name and SHA, (5) machine spec, (6) any deviation from default parameters. Reports missing fingerprints should not be trusted, including ours.

## Roadmap

- [ ] Cross-OS CI matrix publishing reference fingerprints per release (CTL-4 verification)
- [ ] Pinned real-repo corpora (zod, hono at exact SHAs) + scale tiers
- [ ] Adapters: HNSW-configured vector store (expected CTL-1 to CTL-2), LLM-extraction memory pipeline (expected CTL-0 to CTL-1), hosted memory APIs (Mem0/Zep/Supermemory, vendor PRs welcome)
- [ ] Provenance: signed fingerprints
- [ ] Determinism-under-update family (incremental index updates vs full rebuilds)

## License

MIT (see LICENSE). The benchmark, metrics, levels, and fingerprint format are open by design. A determinism standard only matters if anyone can run it, extend it, and hold everyone (including us) to it.

## Related catalogs

ContextBenchmark measures a dimension (context-layer reliability and reproducibility) that does not yet have a dedicated home in general AI-benchmark catalogs. A submission-ready entry for [awesome-ai-benchmarks](https://github.com/panilya/awesome-ai-benchmarks) style lists:

```
**ContextBenchmark** - Open, vendor-neutral benchmark measuring the reliability, reproducibility, and
determinism of AI context systems (retrieval indexes, RAG pipelines, agent memory, code-context
engines) via rebuild-identity, query-stability, drift-under-noise, and cross-machine identity tests,
graded as Context Trust Levels (CTL 0-4) with verifiable fingerprints.
  - Website: https://contextbenchmark.com
  - Code: https://github.com/aabhisrv/contextbenchmark
  - Year: 2026
  - Tags: benchmark, evaluation, reproducibility, determinism, rag, agent-memory, retrieval, reliability
```
