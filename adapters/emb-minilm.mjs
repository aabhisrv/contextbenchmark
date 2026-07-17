// adapters/emb-minilm.mjs — MiniLM chunk-embedding index (typical-RAG reference).
// Represents the mainstream embeddings-over-chunks retrieval stack. Expected
// profile: often D3 on one machine (CPU inference is usually bit-stable),
// frequently FAILS D4 (floating-point differences across hardware/BLAS), and
// ANN-indexed variants (HNSW etc.) typically fail lower — this adapter uses
// exhaustive search, which is the determinism-friendliest configuration; real
// vector-DB deployments are usually worse. Requires: npm i @xenova/transformers

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../lib/metrics.mjs';

export const name = 'emb-minilm';
const MODEL = 'Xenova/all-MiniLM-L6-v2';
const CHUNK_LINES = 40, OVERLAP = 8, DIM = 384;
const EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.py', '.md', '.txt']);

// The system here is this file, plus @xenova/transformers, plus the model
// weights. Only the first two can be pinned. The model is requested by name and
// not by revision, so an upstream change to Xenova/all-MiniLM-L6-v2 would move
// the embeddings, and the artifact hash with them, on any machine with a cold
// cache. That is why this reports `declared` rather than `content-hash`: the id
// names the inputs it can name, and the weights are not among them. Pinning a
// revision would make this provable and is worth doing.
export function version() {
  let dep = 'unresolved';
  try {
    dep = JSON.parse(readFileSync(new URL('../node_modules/@xenova/transformers/package.json', import.meta.url), 'utf8')).version;
  } catch { /* dependency absent; available() will have skipped the run */ }
  const self = sha256(readFileSync(fileURLToPath(import.meta.url))).slice(0, 8);
  return {
    id: `@xenova/transformers@${dep}+${MODEL}+quantized+adapter:${self}`,
    source: 'declared',
    note: 'model pinned by name only, not by revision: weights are not attributable',
  };
}

let pipeP = null;
async function getPipe() {
  if (!pipeP) pipeP = (async () => {
    const { pipeline } = await import('@xenova/transformers');
    return pipeline('feature-extraction', MODEL, { quantized: true });
  })();
  return pipeP;
}

function* walk(dir, root = dir) {
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.git') yield* walk(join(dir, e.name), root); }
    else if (EXTS.has(e.name.slice(e.name.lastIndexOf('.')))) yield relative(root, join(dir, e.name)).replace(/\\/g, '/');
  }
}

export async function build(corpusDir, outDir) {
  mkdirSync(outDir, { recursive: true });
  const embed = await getPipe();
  const chunks = [];
  for (const rel of walk(corpusDir)) {
    if (rel === 'queries.json') continue;
    const lines = readFileSync(join(corpusDir, rel), 'utf8').split('\n');
    for (let s = 0; s < lines.length; s += CHUNK_LINES - OVERLAP) {
      const e = Math.min(lines.length, s + CHUNK_LINES);
      const body = lines.slice(s, e).join('\n').trim();
      if (body.length >= 20) chunks.push({ f: rel, s: s + 1, e, text: `${rel}\n${body}` });
      if (e >= lines.length) break;
    }
  }
  const matrix = new Float32Array(chunks.length * DIM);
  for (let i = 0; i < chunks.length; i += 16) {
    const batch = chunks.slice(i, i + 16);
    const out = await embed(batch.map(c => c.text.slice(0, 1600)), { pooling: 'mean', normalize: true });
    for (let b = 0; b < batch.length; b++) matrix.set(out.data.subarray(b * DIM, (b + 1) * DIM), (i + b) * DIM);
  }
  writeFileSync(join(outDir, 'index.json'), JSON.stringify({
    version: 1, model: MODEL, dim: DIM,
    chunks: chunks.map(c => ({ f: c.f, s: c.s, e: c.e })),
    vectors: Buffer.from(matrix.buffer).toString('base64'),
  }));
}

export async function query(outDir, queryText, k = 10) {
  const idx = JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8'));
  const buf = Buffer.from(idx.vectors, 'base64');
  const matrix = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const embed = await getPipe();
  const out = await embed([String(queryText).slice(0, 800)], { pooling: 'mean', normalize: true });
  const q = out.data;
  const scored = idx.chunks.map((c, i) => {
    let s = 0; const off = i * idx.dim;
    for (let d = 0; d < idx.dim; d++) s += q[d] * matrix[off + d];
    return { file: c.f, score: +s.toFixed(8) };
  });
  // best chunk per file; deterministic tie-break by path
  const best = new Map();
  for (const r of scored) if (!best.has(r.file) || best.get(r.file).score < r.score) best.set(r.file, r);
  return [...best.values()].sort((a, b) => b.score - a.score || a.file.localeCompare(b.file)).slice(0, k);
}
