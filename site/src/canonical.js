/**
 * Canonical-origin rules for the site.
 *
 * Kept in its own module because the Workers runtime treats every named export of
 * the *entrypoint* as a handler or service binding: exporting a plain constant
 * from src/index.js makes the Worker fail to boot with "Incorrect type for map
 * entry". So the entrypoint exports only a default, and the testable logic lives
 * here.
 */

export const CANONICAL_HOST = 'contextbenchmark.com';

const OWNED_HOSTS = new Set([CANONICAL_HOST, 'www.contextbenchmark.com']);

/**
 * Returns the canonical URL to redirect to, or null when the URL is already
 * canonical and should be served as-is.
 *
 * A `_redirects` file cannot express any of this: Cloudflare's static-asset
 * redirects match on path only, so neither www -> apex nor http -> https is
 * possible there. Left unfixed, apex-https, apex-http and www each answer 200
 * with identical bytes, splitting link equity three ways.
 */
export function canonicalise(requestUrl) {
  const url = new URL(requestUrl);
  let moved = false;

  // Only rewrite hosts we actually own. *.workers.dev previews are left alone so
  // they stay independently usable.
  if (OWNED_HOSTS.has(url.hostname)) {
    if (url.hostname !== CANONICAL_HOST) {
      url.hostname = CANONICAL_HOST;
      moved = true;
    }
    if (url.protocol !== 'https:') {
      url.protocol = 'https:';
      url.port = '';
      moved = true;
    }
  }

  // The asset router answers /index.html with a 307, which search engines do not
  // treat as a permanent consolidation signal. Folding it in here also means a
  // request that is wrong on both host and path still costs only one hop.
  if (url.pathname === '/index.html') {
    url.pathname = '/';
    moved = true;
  }

  return moved ? url.toString() : null;
}
