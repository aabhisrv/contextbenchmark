// adapters/spiderbrain.mjs — Spiderbrain deterministic code-context engine.
// Builds a brain (dependency graph + deterministic scores; the build clock is
// frozen to the corpus's max content timestamp, so identical input -> byte-
// identical synganglion.json) and queries it over the local MCP server's
// lexical+structural retrieval.
//
// Requires a local Spiderbrain installation:
//   set SPIDERBRAIN_ENGINE=<path to spiderbrain-engine>   (build-brain.mjs + platforms/mcp/server-v5.mjs)
// Public availability of the Spiderbrain CLI is planned; until then this
// adapter runs only where the engine is installed. Results remain verifiable
// by anyone via the fingerprint format (results/*.fingerprint.json).

import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const name = 'spiderbrain';
const ENGINE = process.env.SPIDERBRAIN_ENGINE ||
  'C:/Users/testadmin/Documents/projects/SB SOFTWARE/spiderbrain-engine';

export function available() {
  return existsSync(join(ENGINE, 'scripts/build-brain.mjs'));
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
