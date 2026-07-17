// adapters/bm25.mjs — pure-JS BM25 lexical index (reference baseline).
// Exists to prove the bar is reachable: a plainly-engineered retriever passes
// every determinism family. If a sophisticated system scores below this
// baseline on determinism, that is the finding.
//
// Adapter contract (see adapters/ADAPTER.md):
//   build(corpusDir, outDir)        -> writes the complete artifact into outDir
//   query(outDir, queryText, k)     -> [{ file, score }] ranked, length <= k
//   name                            -> display name

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../lib/metrics.mjs';

export const name = 'bm25';

// This file imports nothing but node builtins, so it IS the system under test in
// its entirety. That makes its identity provable rather than asserted: hash the
// source and anyone can recompute the same id from the same bytes.
export function version() {
  return { id: `sha256:${sha256(readFileSync(fileURLToPath(import.meta.url))).slice(0, 16)}`, source: 'content-hash' };
}
const K1 = 1.2, B = 0.75;
const EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.py', '.md', '.json', '.txt']);

const tokenize = (text) => text.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 1);

function* walk(dir, root = dir) {
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.git') yield* walk(join(dir, e.name), root); }
    else if (EXTS.has(e.name.slice(e.name.lastIndexOf('.')))) yield relative(root, join(dir, e.name)).replace(/\\/g, '/');
  }
}

export function build(corpusDir, outDir) {
  mkdirSync(outDir, { recursive: true });
  const docs = {};                    // file -> { len, tf: {term: count} }
  const df = {};                      // term -> doc count
  for (const rel of walk(corpusDir)) {
    if (rel === 'queries.json') continue;
    const toks = tokenize(readFileSync(join(corpusDir, rel), 'utf8'));
    const tf = {};
    for (const t of toks) tf[t] = (tf[t] || 0) + 1;
    docs[rel] = { len: toks.length, tf: Object.fromEntries(Object.entries(tf).sort()) };
    for (const t of Object.keys(tf)) df[t] = (df[t] || 0) + 1;
  }
  const N = Object.keys(docs).length;
  const avgLen = Object.values(docs).reduce((a, d) => a + d.len, 0) / (N || 1);
  // stable serialization: sorted keys everywhere -> byte-identical rebuilds
  const artifact = {
    version: 1, N, avgLen,
    df: Object.fromEntries(Object.entries(df).sort()),
    docs: Object.fromEntries(Object.entries(docs).sort()),
  };
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(artifact));
}

export function query(outDir, queryText, k = 10) {
  const idx = JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8'));
  const terms = tokenize(queryText);
  const scores = [];
  for (const [file, d] of Object.entries(idx.docs)) {
    let s = 0;
    for (const t of terms) {
      const tf = d.tf[t] || 0;
      if (!tf) continue;
      const idf = Math.log(1 + (idx.N - idx.df[t] + 0.5) / (idx.df[t] + 0.5));
      s += idf * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * d.len / idx.avgLen));
    }
    if (s > 0) scores.push({ file, score: +s.toFixed(8) });
  }
  // deterministic tie-break: score desc, then path asc
  return scores.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file)).slice(0, k);
}
