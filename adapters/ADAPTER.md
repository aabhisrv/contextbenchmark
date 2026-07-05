# contextbenchmark adapter contract

An adapter connects one context system (retriever, index, memory engine, RAG stack) to the benchmark. It must be honest — configure the system the way it actually ships, not a determinism-friendly special mode (if you benchmark a special mode, name it, e.g. `myindex-exhaustive`).

## Required exports

```js
export const name = 'my-system';            // display + file naming

export async function build(corpusDir, outDir) {
  // Read the corpus from corpusDir (a directory tree of source/text files).
  // Write EVERYTHING the system persists into outDir. Called multiple times
  // with fresh outDirs — do not share state between builds (no caches outside
  // outDir, no reuse of a previous build).
}

export async function query(outDir, queryText, k) {
  // Load the artifact from outDir, retrieve for queryText, and return a
  // ranked list, most relevant first, at most k entries:
  //   [{ file: 'path/relative/to/corpus.ts', score: 0.87 }, ...]
  // Ties MUST be broken deterministically only if your system claims
  // determinism — do not add a tie-break your production system doesn't have.
}
```

## Optional exports

```js
export const artifactFile = 'index.json';   // optional
// Rebuild-Identity hashes this single file inside outDir instead of the whole
// directory. Declare it when your system writes legitimately-variable sidecar
// files (logs, timestamps) SEPARATE from the artifact of record. The artifact
// of record must be the thing your queries actually read.

export function available() { return true; }
// Return false to skip gracefully on machines missing credentials/binaries.
// Skipped ≠ passed: reports mark the adapter as not run.
```

## Rules of honesty

1. **No benchmark-only determinism.** Seeds, sorts, or flags added for contextbenchmark that production users don't get = misrepresentation.
2. **Remote systems**: adapters may call hosted APIs (put keys behind `available()`), but the report must say so — network nondeterminism then counts against the system, because users experience it too.
3. **File-level granularity**: map your system's native results (chunks, memories, symbols) to corpus-relative file paths; document the mapping in a header comment.
4. **Async is fine** everywhere; the runner awaits both `build` and `query`.
5. Keep dependencies inside the adapter (dynamic `import()`), so the core benchmark stays dependency-free.
6. **Auto-checks are in place to detect plagiarism** To make sure the benchmark standards are maintained
