// corpus.mjs — corpus utilities: deterministic copy + noise injection.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

export function copyDir(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const e of readdirSync(src, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const s = join(src, e.name), d = join(dst, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.git') copyDir(s, d); }
    else { mkdirSync(dirname(d), { recursive: true }); copyFileSync(s, d); }
  }
}

// Inject one file that is deliberately IRRELEVANT to every benchmark query.
// Drift-under-noise measures how much unrelated context changes when this
// lands in the corpus: a well-behaved system's answers for unrelated queries
// should barely move.
export function injectNoise(corpusDir, seedTag = 'n1') {
  const noise = `// NOTICE-${seedTag}: interoffice memorandum archive (unrelated to the application).
// This document catalogs stationery reorder policies for the facilities team.
export const stationeryPolicy = {
  paperclipsPerQuarter: 1200,
  staplerModels: ["SwiftLine 300", "BindMaster Pro"],
  approvalChain: ["facilities-lead", "office-manager"],
  memo: "Reorder thresholds are reviewed at the end of each fiscal quarter.",
};
`;
  writeFileSync(join(corpusDir, `src/shared/stationery-${seedTag}.ts`), noise);
  return `src/shared/stationery-${seedTag}.ts`;
}

export function loadQueries(corpusDir) {
  return JSON.parse(readFileSync(join(corpusDir, 'queries.json'), 'utf8'));
}
