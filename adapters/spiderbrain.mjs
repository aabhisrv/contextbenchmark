// adapters/spiderbrain.mjs — Spiderbrain deterministic code-context engine.
// Builds a brain (dependency graph + deterministic scores) and queries it over
// the local MCP server's lexical+structural retrieval.
//
// Known defect (2026-07-17, logged with the engine): synganglion.json embeds
// the git HEAD commit time of the repository enclosing the scanned project
// (epoch outside git) and the project's absolute path. Rebuild-identity still
// passes because all rebuilds within a run share that state, but the artifact
// hash is NOT recomputable across commits or clone locations until the engine
// stops serialising environment into the artifact of record. Query hashes are
// unaffected. An earlier version of this header claimed the clock was frozen
// to the corpus's max content timestamp; that was the intent, not the behaviour.
//
// Requires a local Spiderbrain installation:
//   set SPIDERBRAIN_ENGINE=<path to spiderbrain-engine>   (build-brain.mjs + platforms/mcp/server-v5.mjs)
// Public availability of the Spiderbrain CLI is planned; until then this
// adapter runs only where the engine is installed. Results remain verifiable
// by anyone via the fingerprint format (results/*.fingerprint.json).

import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { hashDir } from '../lib/metrics.mjs';

export const name = 'spiderbrain';
const ENGINE = process.env.SPIDERBRAIN_ENGINE ||
  'C:/Users/testadmin/Documents/projects/SB SOFTWARE/spiderbrain-engine';

// The engine directories this adapter actually invokes, directly or by import.
// Deliberately not the whole engine tree: it also carries backups, design notes
// and unrelated workers, and letting those move the identity would report
// "different system" for edits that cannot touch retrieval.
const SCOPE = ['core', 'platforms', 'scripts'];

export function available() {
  return existsSync(join(ENGINE, 'scripts/build-brain.mjs'));
}

// The engine has no version to report: its package.json carries no version
// field, and it is gitignored inside its parent repo, so that repo's HEAD says
// nothing about the engine's contents and quoting it would be misleading. A
// content hash is therefore the only honest identity available, and it is the
// better one anyway: it is recomputable by anyone holding the same engine.
//
// This matters. Between 2026-07-05 and 2026-07-17 the engine changed, the
// artifact hash moved with it, and `compare` reported FAIL against the published
// fingerprint. The system had not become nondeterministic; it had become a
// different system, and nothing in the fingerprint could say so.
export function version() {
  const h = createHash('sha256');
  for (const sub of SCOPE) {
    const dir = join(ENGINE, sub);
    if (!existsSync(dir)) continue;
    h.update(sub);
    h.update(hashDir(dir, { ignore: (p) => p === 'node_modules' || p.endsWith('/node_modules') }).hash);
  }
  return {
    id: `sha256:${h.digest('hex').slice(0, 16)}`,
    source: 'content-hash',
    note: `engine source scope: ${SCOPE.join(', ')} (node_modules excluded)`,
  };
}

export function build(corpusDir, outDir) {
  mkdirSync(outDir, { recursive: true });
  execFileSync('node', [join(ENGINE, 'scripts/build-brain.mjs'), '--project', corpusDir, '--brain', outDir],
    { stdio: 'ignore', maxBuffer: 64 * 1024 * 1024 });
}

// one-shot MCP stdio call: initialize -> tools/call spiderbrain_search
export function query(outDir, queryText, k = 10) {
  return new Promise((resolveP, reject) => {
    const server = join(ENGINE, 'platforms/mcp/server-v5.mjs');
    const child = spawn('node', [server, '--brain', outDir], { windowsHide: true });
    let out = '';
    child.stdout.on('data', d => {
      out += d;
      const lines = out.split('\n').filter(Boolean);
      for (const line of lines) {
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 2) {
          try { child.kill(); } catch {}
          const text = msg.result?.content?.[0]?.text || '';
          // parse ranked file paths from the search tool's text output
          const files = [...text.matchAll(/^\s*\d+[.)]\s+(\S+?)(?:\s|$)/gm)].map(m => m[1]);
          const uniq = [...new Set(files)].slice(0, k);
          resolveP(uniq.map((file, i) => ({ file: file.replace(/\\/g, '/'), score: +(1 / (i + 1)).toFixed(8) })));
        }
      }
    });
    child.on('error', reject);
    setTimeout(() => { try { child.kill(); } catch {}; reject(new Error('spiderbrain query timeout')); }, 60_000);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'detbench', version: '1' } } }) + '\n');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'spiderbrain_search', arguments: { query: queryText, limit: k } } }) + '\n');
  });
}

// artifact file to hash for rebuild-identity (the deterministic core output)
export const artifactFile = 'synganglion.json';
