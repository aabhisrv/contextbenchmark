import { canonicalise } from './canonical.js';

/**
 * The site is plain static assets. This Worker exists only to collapse every
 * request onto one canonical origin (see ./canonical.js for why that cannot be a
 * _redirects file), then hand off to the asset router.
 *
 * Export nothing but the default here: the runtime reads named exports of the
 * entrypoint as handlers and refuses to boot on anything that is not one.
 */
export default {
  async fetch(request, env) {
    // `wrangler dev` serves plain http on localhost while reporting request.url
    // as the custom domain, so the https upgrade below would redirect to itself
    // forever. .dev.vars disables canonicalisation for local development only;
    // absent that file (ie. in production) it stays on.
    if (env.CANONICALISE !== 'off') {
      const target = canonicalise(request.url);
      if (target) return Response.redirect(target, 301);
    }

    return env.ASSETS.fetch(request);
  },
};
