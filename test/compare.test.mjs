// Verdict matrix for lib/fingerprint.mjs.
//
// The scenario that motivated format 2 is pinned here: a v1 fingerprint whose
// artifact hash moved because the system changed must NOT be reported as FAIL,
// because format 1 cannot attribute the difference. FAIL is reserved for the
// one case the evidence supports: identical declared inputs, different output.
//
// Run: npm run test:bench

import test from 'node:test';
import assert from 'node:assert/strict';
import { compareFingerprints } from '../lib/fingerprint.mjs';

const ENV_A = { os: 'linux 6.8', arch: 'x64', node: 'v24.14.0' };
const ENV_B = { os: 'win32 10.0.19045', arch: 'x64', node: 'v24.14.0' };
const QUERIES = { q1: 'aaa', q2: 'bbb' };

const v2 = (over = {}) => ({
  contextbenchmarkFingerprint: 2,
  benchmarkVersion: '0.1.0',
  adapter: 'bm25',
  system: { id: 'sha256:abc', source: 'content-hash' },
  corpus: { name: 'micro-app', hash: 'c0ffee' },
  env: ENV_A,
  artifactHash: 'art1',
  queryHashes: { ...QUERIES },
  ...over,
});

const v1 = (over = {}) => ({
  contextbenchmarkFingerprint: 1,
  adapter: 'spiderbrain',
  corpus: 'micro-app',
  env: ENV_A,
  artifactHash: 'art1',
  queryHashes: { ...QUERIES },
  ...over,
});

test('identical v2 fingerprints across machines: PASS, verified, exit 0', () => {
  const r = compareFingerprints(v2(), v2({ env: ENV_B }));
  assert.equal(r.outcome, 'PASS');
  assert.equal(r.verified, true);
  assert.equal(r.exitCode, 0);
});

test('different artifact with fully declared identical inputs: FAIL, exit 1', () => {
  const r = compareFingerprints(v2(), v2({ env: ENV_B, artifactHash: 'art2' }));
  assert.equal(r.outcome, 'FAIL');
  assert.equal(r.exitCode, 1);
});

test('different system identity: NOT_COMPARABLE, exit 2, no verdict', () => {
  const r = compareFingerprints(v2(), v2({ system: { id: 'sha256:def', source: 'content-hash' }, artifactHash: 'art2' }));
  assert.equal(r.outcome, 'NOT_COMPARABLE');
  assert.equal(r.exitCode, 2);
  assert.match(r.blockers.join(','), /system identity/);
});

test('different corpus content under the same corpus name: NOT_COMPARABLE', () => {
  const r = compareFingerprints(v2(), v2({ corpus: { name: 'micro-app', hash: 'dec0de' } }));
  assert.equal(r.outcome, 'NOT_COMPARABLE');
  assert.match(r.blockers.join(','), /corpus content/);
});

test('different benchmark version: NOT_COMPARABLE', () => {
  const r = compareFingerprints(v2(), v2({ benchmarkVersion: '0.2.0' }));
  assert.equal(r.outcome, 'NOT_COMPARABLE');
});

test('THE MOTIVATING CASE: v1 vs v1, artifact moved, nothing attributable: INCONCLUSIVE not FAIL', () => {
  const r = compareFingerprints(v1(), v1({ artifactHash: 'art2' }));
  assert.equal(r.outcome, 'INCONCLUSIVE');
  assert.equal(r.exitCode, 3);
  assert.ok(r.unknowns.includes('system identity'));
});

test('v1 vs v1 identical results: PASS but unverified (exit 0, CI stays green)', () => {
  const r = compareFingerprints(v1(), v1({ env: ENV_B }));
  assert.equal(r.outcome, 'PASS');
  assert.equal(r.verified, false);
  assert.equal(r.exitCode, 0);
});

test('v1 vs v2 of the same adapter: comparable, unverified via the null side', () => {
  const a = v1({ adapter: 'bm25' });
  const b = v2({ env: ENV_B });
  const r = compareFingerprints(a, b);
  assert.equal(r.outcome, 'PASS');
  assert.equal(r.verified, false);
});

test('different adapters never compare', () => {
  const r = compareFingerprints(v2(), v2({ adapter: 'emb-minilm' }));
  assert.equal(r.outcome, 'NOT_COMPARABLE');
});

test('partial query overlap counts matches, not just totals', () => {
  const r = compareFingerprints(v2(), v2({ env: ENV_B, queryHashes: { q1: 'aaa', q2: 'CHANGED' } }));
  assert.equal(r.outcome, 'FAIL');
  assert.equal(r.queryMatches, 1);
  assert.equal(r.queryTotal, 2);
});
