/**
 * Redirect rules for the site's canonical origin.
 *
 * These assert the rules directly rather than through `wrangler dev`, which
 * rewrites request.url to the configured custom domain and rewrites outgoing
 * Location headers back to localhost. That makes the dev server structurally
 * unable to answer "does www redirect to apex", which is the whole question here.
 *
 * Run: node --test site/test/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { canonicalise } from '../src/canonical.js';

const PROD = { ASSETS: { fetch: () => new Response('asset') } };

test('www redirects to apex over https', () => {
  assert.equal(canonicalise('https://www.contextbenchmark.com/'), 'https://contextbenchmark.com/');
});

test('http redirects to https on the apex', () => {
  assert.equal(canonicalise('http://contextbenchmark.com/'), 'https://contextbenchmark.com/');
});

test('http+www collapses to canonical in a single hop', () => {
  assert.equal(canonicalise('http://www.contextbenchmark.com/'), 'https://contextbenchmark.com/');
});

test('path and query survive the redirect', () => {
  assert.equal(
    canonicalise('http://www.contextbenchmark.com/llms.txt?x=1#frag'),
    'https://contextbenchmark.com/llms.txt?x=1#frag',
  );
});

test('port 80 is dropped when upgrading to https', () => {
  assert.equal(canonicalise('http://contextbenchmark.com:80/'), 'https://contextbenchmark.com/');
});

test('/index.html folds to / permanently', () => {
  assert.equal(canonicalise('https://contextbenchmark.com/index.html'), 'https://contextbenchmark.com/');
});

test('a wrong host and /index.html together still cost one hop', () => {
  assert.equal(canonicalise('http://www.contextbenchmark.com/index.html'), 'https://contextbenchmark.com/');
});

test('the canonical URL is left alone', () => {
  assert.equal(canonicalise('https://contextbenchmark.com/'), null);
  assert.equal(canonicalise('https://contextbenchmark.com/llms.txt'), null);
});

test('hosts we do not own are never rewritten', () => {
  assert.equal(canonicalise('http://localhost:8788/'), null);
  assert.equal(canonicalise('https://contextbenchmark-site.workers.dev/'), null);
  // Guard against a prefix match treating an attacker-controlled host as ours.
  assert.equal(canonicalise('https://contextbenchmark.com.evil.test/'), null);
});

test('fetch issues a 301 to the canonical URL', async () => {
  const res = await worker.fetch(new Request('http://www.contextbenchmark.com/'), PROD);
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), 'https://contextbenchmark.com/');
});

test('fetch falls through to static assets when already canonical', async () => {
  const res = await worker.fetch(new Request('https://contextbenchmark.com/'), PROD);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'asset');
});

test('canonicalisation is on by default, ie. when no var is set in production', async () => {
  const res = await worker.fetch(new Request('http://contextbenchmark.com/'), PROD);
  assert.equal(res.status, 301);
});

test('.dev.vars can switch it off so wrangler dev does not loop', async () => {
  const res = await worker.fetch(new Request('http://contextbenchmark.com/'), {
    ...PROD,
    CANONICALISE: 'off',
  });
  assert.equal(res.status, 200);
});

test('the entrypoint exports nothing but a default, or the runtime refuses to boot', async () => {
  const mod = await import('../src/index.js');
  assert.deepEqual(Object.keys(mod), ['default']);
});
