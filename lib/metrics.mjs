// metrics.mjs — determinism metrics for detbench.
// All metrics operate on ranked result lists: [{ file, score }] (top-k).

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// hash a whole artifact directory deterministically (sorted relative paths)
export function hashDir(dir) {
  const files = [];
  const walk = (d, rel = '') => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(d, e.name), r);
      else files.push(r);
    }
  };
  walk(dir);
  const h = createHash('sha256');
  for (const f of files) {
    h.update(f); h.update('\0');
    h.update(readFileSync(join(dir, f))); h.update('\0');
  }
  return { hash: h.digest('hex'), fileCount: files.length };
}

export const resultKey = (results) => sha256(JSON.stringify(results.map(r => r.file)));

// Exact Match Rate over trials: fraction of trials identical to the first
export function exactMatchRate(trialResults) {
  const first = resultKey(trialResults[0]);
  return trialResults.filter(t => resultKey(t) === first).length / trialResults.length;
}

export function jaccard(a, b) {
  const A = new Set(a.map(r => r.file)), B = new Set(b.map(r => r.file));
  const inter = [...A].filter(x => B.has(x)).length;
  const uni = new Set([...A, ...B]).size;
  return uni === 0 ? 1 : inter / uni;
}

// Kendall's tau-a over the intersection of two ranked lists
export function kendallTau(a, b) {
  const rankB = new Map(b.map((r, i) => [r.file, i]));
  const common = a.filter(r => rankB.has(r.file)).map(r => r.file);
  const n = common.length;
  if (n < 2) return 1;
  let concordant = 0, discordant = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const d = (rankB.get(common[i]) - rankB.get(common[j]));
    if (d < 0) concordant++; else if (d > 0) discordant++;
  }
  return (concordant - discordant) / (n * (n - 1) / 2);
}

export function meanPairwise(trialResults, fn) {
  let sum = 0, n = 0;
  for (let i = 0; i < trialResults.length; i++)
    for (let j = i + 1; j < trialResults.length; j++) { sum += fn(trialResults[i], trialResults[j]); n++; }
  return n === 0 ? 1 : sum / n;
}

// ── Determinism Levels (the standard) ───────────────────────────────────────
// D4  portable-deterministic   byte-identical artifacts + identical results across machines/OS
// D3  machine-deterministic    byte-identical artifacts + identical results across rebuilds (one machine)
// D2  semantically deterministic  artifact bytes differ, query results identical (EMR = 1)
// D1  rank-stable              results not identical but Jaccard@k >= 0.9 AND tau >= 0.9
// D0  nondeterministic         below D1
export function assignLevel({ rebuildIdentical, queryEMR, queryJaccard, queryTau, crossMachineIdentical = null }) {
  if (crossMachineIdentical === true && rebuildIdentical && queryEMR === 1) return 'D4';
  if (rebuildIdentical && queryEMR === 1) return 'D3';
  if (queryEMR === 1) return 'D2';
  if (queryJaccard >= 0.9 && queryTau >= 0.9) return 'D1';
  return 'D0';
}
