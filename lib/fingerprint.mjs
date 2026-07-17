// fingerprint.mjs — the exchange format, and what it means to compare two of them.
//
// A fingerprint answers "what did this system produce". To adjudicate a
// determinism claim you also need "what system produced it", and against what
// inputs. Format 1 recorded only `env` (os/arch/node), which is precisely the
// variable cross-machine identity is *supposed* to vary. The controlled
// variables (system identity, corpus content, benchmark version) went
// unrecorded, so a hash mismatch could not be attributed:
//
//   - the system is nondeterministic  -> a real failure, the thing we test for
//   - the system changed since        -> expected, and not a failure at all
//
// Format 1 reported both as FAIL. That is the most serious claim this tool
// makes, and it made it on evidence that could not support it. Format 2 records
// the controlled variables so FAIL means something.

export const FINGERPRINT_FORMAT = 2;

/** Format 1 wrote `corpus: 'micro-app'`; format 2 writes `corpus: {name, hash}`. */
function normalise(fp) {
  const corpus = typeof fp.corpus === 'string'
    ? { name: fp.corpus, hash: null }
    : { name: fp.corpus?.name ?? null, hash: fp.corpus?.hash ?? null };
  return {
    format: fp.contextbenchmarkFingerprint ?? 1,
    adapter: fp.adapter,
    corpus,
    benchmarkVersion: fp.benchmarkVersion ?? null,
    system: fp.system ?? null,
    env: fp.env,
    artifactHash: fp.artifactHash,
    queryHashes: fp.queryHashes ?? {},
  };
}

/**
 * Compare two fingerprints.
 *
 * Controlled variables (adapter, corpus, benchmark version, system identity)
 * must match for the comparison to mean anything. The machine is the
 * independent variable and is expected to differ: that is the whole test.
 *
 * Outcomes:
 *   PASS          identical artifact and query results
 *   FAIL          they differ, and the inputs are provably identical, so the
 *                 system itself is nondeterministic
 *   INCONCLUSIVE  they differ, but an input is unattributable, so we cannot
 *                 tell nondeterminism from a version change. Not a failure.
 *   NOT_COMPARABLE a controlled variable provably differs
 */
export function compareFingerprints(A, B) {
  const a = normalise(A);
  const b = normalise(B);

  const blockers = [];
  const unknowns = [];
  const check = (label, x, y) => {
    if (x == null || y == null) unknowns.push(label);
    else if (x !== y) blockers.push(`${label} (${x} vs ${y})`);
  };

  check('adapter', a.adapter, b.adapter);
  check('corpus', a.corpus.name, b.corpus.name);
  check('corpus content', a.corpus.hash, b.corpus.hash);
  check('benchmark version', a.benchmarkVersion, b.benchmarkVersion);
  check('system identity', a.system?.id, b.system?.id);

  const qKeys = Object.keys(a.queryHashes);
  const queryMatches = qKeys.filter(q => a.queryHashes[q] === b.queryHashes[q]).length;
  const artifactMatch = a.artifactHash === b.artifactHash;
  const base = { a, b, artifactMatch, queryMatches, queryTotal: qKeys.length, unknowns, blockers };

  if (blockers.length) return { ...base, outcome: 'NOT_COMPARABLE', verified: false, exitCode: 2 };

  const verified = unknowns.length === 0;
  const identical = artifactMatch && queryMatches === qKeys.length;

  // An identical hash is close to self-evidencing: the same digest over the same
  // query set means the same system met the same corpus. Undeclared identity
  // makes the claim weaker to cite, not wrong, so it passes and says so.
  if (identical) return { ...base, outcome: 'PASS', verified, exitCode: 0 };

  // A difference is the opposite: it only means "nondeterministic" if the inputs
  // were provably identical. Without that, this is the exact false FAIL that
  // format 2 exists to stop.
  if (!verified) return { ...base, outcome: 'INCONCLUSIVE', verified, exitCode: 3 };

  return { ...base, outcome: 'FAIL', verified, exitCode: 1 };
}

/** Human-readable report. Returns lines; the caller prints and exits. */
export function formatComparison(r) {
  const { a, b } = r;
  const id = (fp) => fp.system ? `${fp.system.id} (${fp.system.source})` : 'not declared';
  const lines = [
    '',
    'contextbenchmark compare (cross-machine identity)',
    `  A: ${a.env.os}/${a.env.arch} node ${a.env.node}  (${a.adapter}, fingerprint v${a.format})`,
    `  B: ${b.env.os}/${b.env.arch} node ${b.env.node}  (${b.adapter}, fingerprint v${b.format})`,
    `  system identity: A ${id(a)} | B ${id(b)}`,
  ];

  if (r.outcome === 'NOT_COMPARABLE') {
    lines.push(`  NOT COMPARABLE: ${r.blockers.join(', ')}`);
    lines.push('  A controlled variable differs, so neither PASS nor FAIL would mean anything.');
    return lines;
  }

  lines.push(`  artifact hash: ${r.artifactMatch ? 'IDENTICAL' : 'DIFFERENT'}`);
  lines.push(`  query results: ${r.queryMatches}/${r.queryTotal} identical`);

  if (r.outcome === 'PASS') {
    lines.push(`  cross-machine verdict: PASS (CTL-4-eligible)${r.verified ? '' : ' (UNVERIFIED)'}`);
    if (!r.verified) {
      lines.push(`  unattributable: ${r.unknowns.join(', ')}`);
      lines.push('  The hashes match, so this passes. Declare the missing identity to make');
      lines.push('  the claim citable: a level is only meaningful next to what produced it.');
    }
  } else if (r.outcome === 'INCONCLUSIVE') {
    lines.push('  cross-machine verdict: INCONCLUSIVE (UNVERIFIED)');
    lines.push(`  unattributable: ${r.unknowns.join(', ')}`);
    lines.push('  The results differ, but an input cannot be attributed, so this does not');
    lines.push('  show nondeterminism: a changed system produces exactly this signature.');
    lines.push('  Re-run both sides with the identity declared to get a real verdict.');
  } else {
    lines.push('  cross-machine verdict: FAIL');
    lines.push('  Inputs are provably identical and the results are not, so the system');
    lines.push('  itself is nondeterministic.');
  }
  return lines;
}
