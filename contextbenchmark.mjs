#!/usr/bin/env node
// contextbenchmark — the open benchmark for AI context systems.
//
//   node detbench.mjs run     [--corpus corpora/micro-app] [--adapters bm25,emb-minilm,spiderbrain]
//                             [--families rebuild,query,drift] [--rebuilds 3] [--trials 5] [--k 10]
//                             [--out results/<auto>.json]
//   node detbench.mjs compare <fingerprintA.json> <fingerprintB.json>
//
// Families (see README for definitions):
//   rebuild  Rebuild-Identity      same corpus, R fresh builds -> identical artifact?
//   query    Query-Stability       same artifact, T trials/query -> identical ranked context?
//   drift    Drift-Under-Noise     irrelevant file added -> how much do unrelated answers move?
//   (cross)  Cross-Machine         via `compare` on fingerprints from two machines
//
// Scope guard: contextbenchmark measures the CONTEXT layer only. LLM inference
// nondeterminism is explicitly out of scope (see README "What this is not").

import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { hashDir, sha256, exactMatchRate, jaccard, kendallTau, meanPairwise, resultKey, assignLevel } from './lib/metrics.mjs';
import { copyDir, injectNoise, loadQueries } from './lib/corpus.mjs';
import { FINGERPRINT_FORMAT, compareFingerprints, formatComparison } from './lib/fingerprint.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = { _: [] };
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a.startsWith('--')) { args[a.slice(2)] = process.argv[i + 1]; i += 1; } else args._.push(a);
}
const cmd = args._[0] || 'run';

// ── compare (cross-machine identity) ────────────────────────────────────────
if (cmd === 'compare') {
  const [A, B] = [args._[1], args._[2]].map(p => JSON.parse(readFileSync(resolve(p), 'utf8')));
  const result = compareFingerprints(A, B);
  for (const line of formatComparison(result)) console.log(line);
  process.exit(result.exitCode);
}

// ── run ─────────────────────────────────────────────────────────────────────
const CORPUS = resolve(__dirname, args.corpus || 'corpora/micro-app');
const FAMILIES = (args.families || 'rebuild,query,drift').split(',');
const REBUILDS = Number(args.rebuilds || 3);
const TRIALS = Number(args.trials || 5);
const K = Number(args.k || 10);
const corpusName = CORPUS.replace(/\\/g, '/').split('/').pop();
// The corpus is a controlled variable, so record what it actually contained.
// Comparing corpora by name alone lets the inputs change under a claim silently.
const corpusHash = hashDir(CORPUS).hash;
const BENCHMARK_VERSION = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version;

const adapterNames = (args.adapters || 'bm25').split(',');
const adapters = [];
for (const n of adapterNames) {
  const mod = await import(`./adapters/${n}.mjs`);
  if (mod.available && !mod.available()) { console.log(`[skip] adapter ${n}: not available on this machine`); continue; }
  adapters.push(mod);
}

// Ask each adapter what it is. Optional: an adapter that cannot answer (a hosted
// API, say) still runs, and its fingerprints are marked unattributable rather
// than being refused.
const systemIdentity = async (ad) => {
  if (!ad.version) return null;
  try {
    const v = await ad.version();
    return typeof v === 'string' ? { id: v, source: 'declared' } : v;
  } catch (e) {
    console.log(`[warn] adapter ${ad.name}: version() threw, identity not recorded (${e.message})`);
    return null;
  }
};

const queries = loadQueries(CORPUS);
const stamp = `${corpusName}-${adapters.map(a => a.name).join('+')}`;
const WORKROOT = join(os.tmpdir(), `detbench-${process.pid}`);
mkdirSync(WORKROOT, { recursive: true });
mkdirSync(resolve(__dirname, 'results'), { recursive: true });

const report = { detbench: 1, corpus: corpusName, queries: queries.length, k: K, rebuilds: REBUILDS, trials: TRIALS,
  env: { os: `${os.platform()} ${os.release()}`, arch: os.arch(), node: process.version },
  adapters: {} };

for (const ad of adapters) {
  console.log(`\n=== ${ad.name} ===`);
  const R = { family: {} };
  const artifactOf = (dir) => ad.artifactFile ? sha256(readFileSync(join(dir, ad.artifactFile))) : hashDir(dir).hash;

  // rebuild-identity
  const buildDirs = [];
  const hashes = [];
  for (let r = 0; r < (FAMILIES.includes('rebuild') ? REBUILDS : 1); r++) {
    const dir = join(WORKROOT, `${ad.name}-build-${r}`);
    await ad.build(CORPUS, dir);
    buildDirs.push(dir);
    hashes.push(artifactOf(dir));
  }
  const rebuildIdentical = new Set(hashes).size === 1;
  if (FAMILIES.includes('rebuild')) {
    R.family.rebuild = { rebuilds: hashes.length, identical: rebuildIdentical, hashes: [...new Set(hashes)] };
    console.log(`  rebuild-identity: ${rebuildIdentical ? 'PASS' : 'FAIL'} (${new Set(hashes).size} distinct hashes over ${hashes.length} builds)`);
  }

  // query-stability (on build #0)
  let queryEMR = 1, queryJac = 1, queryTau = 1;
  const queryHashes = {};
  if (FAMILIES.includes('query')) {
    let emrSum = 0, jacSum = 0, tauSum = 0;
    for (const q of queries) {
      const trials = [];
      for (let t = 0; t < TRIALS; t++) trials.push(await ad.query(buildDirs[0], q, K));
      emrSum += exactMatchRate(trials);
      jacSum += meanPairwise(trials, jaccard);
      tauSum += meanPairwise(trials, kendallTau);
      queryHashes[q] = resultKey(trials[0]);
    }
    queryEMR = +(emrSum / queries.length).toFixed(4);
    queryJac = +(jacSum / queries.length).toFixed(4);
    queryTau = +(tauSum / queries.length).toFixed(4);
    R.family.query = { trialsPerQuery: TRIALS, exactMatchRate: queryEMR, meanJaccard: queryJac, meanKendallTau: queryTau };
    console.log(`  query-stability: EMR=${queryEMR} jaccard=${queryJac} tau=${queryTau} ${queryEMR === 1 ? '(PASS)' : '(FAIL)'}`);
  }

  // drift-under-noise
  if (FAMILIES.includes('drift')) {
    const noisyCorpus = join(WORKROOT, `${ad.name}-noisy-corpus`);
    copyDir(CORPUS, noisyCorpus);
    const noiseFile = injectNoise(noisyCorpus);
    const noisyBuild = join(WORKROOT, `${ad.name}-noisy-build`);
    await ad.build(noisyCorpus, noisyBuild);
    let jacSum = 0, tauSum = 0, noiseHits = 0;
    for (const q of queries) {
      const base = await ad.query(buildDirs[0], q, K);
      const noisy = await ad.query(noisyBuild, q, K);
      jacSum += jaccard(base, noisy);
      tauSum += kendallTau(base, noisy);
      if (noisy.some(r => r.file === noiseFile)) noiseHits++;
    }
    const driftJaccard = +(jacSum / queries.length).toFixed(4);
    R.family.drift = { noiseFile, meanJaccardVsBase: driftJaccard, meanKendallTau: +(tauSum / queries.length).toFixed(4),
      noiseInTopK: noiseHits, driftScore: +(1 - driftJaccard).toFixed(4) };
    console.log(`  drift-under-noise: jaccard=${driftJaccard} noiseInTop${K}=${noiseHits}/${queries.length} drift=${R.family.drift.driftScore} ${driftJaccard >= 0.9 && noiseHits === 0 ? '(PASS)' : driftJaccard >= 0.75 ? '(WARN)' : '(FAIL)'}`);
  }

  const level = assignLevel({ rebuildIdentical, queryEMR, queryJaccard: queryJac, queryTau });
  R.level = level;
  console.log(`  LEVEL: ${level} (CTL-4 requires a cross-machine \`compare\` PASS)`);
  report.adapters[ad.name] = R;

  // Fingerprint for cross-machine exchange. Everything above `env` is a
  // controlled variable and has to match for a comparison to mean anything;
  // `env` is the independent variable and is expected to differ.
  const system = await systemIdentity(ad);
  const fp = { contextbenchmarkFingerprint: FINGERPRINT_FORMAT, benchmarkVersion: BENCHMARK_VERSION,
    adapter: ad.name, system, corpus: { name: corpusName, hash: corpusHash }, k: K,
    env: report.env, artifactHash: hashes[0], queryHashes };
  const fpPath = resolve(__dirname, 'results', `${ad.name}.${corpusName}.${os.platform()}-${os.arch()}.fingerprint.json`);
  writeFileSync(fpPath, JSON.stringify(fp, null, 1));
  console.log(`  system: ${system ? `${system.id} (${system.source})` : 'not declared, fingerprints will be unattributable'}`);
  console.log(`  fingerprint → ${fpPath}`);
}

const outPath = resolve(__dirname, args.out || `results/run-${stamp}.json`);
writeFileSync(outPath, JSON.stringify(report, null, 1));
console.log(`\nreport → ${outPath}`);
try { rmSync(WORKROOT, { recursive: true, force: true }); } catch {}
