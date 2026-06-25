# Professional hardening checklist

This change set focuses on measurable production improvements without weakening existing authentication or Firebase rules.

## Included

- Faster news first paint with a lightweight feed response.
- Bounded article enrichment instead of waiting on every external source.
- Browser, Netlify CDN, and in-memory news caching.
- Local last-known-good news cache with background refresh.
- Skeleton, retry, and offline user states.
- Safer external links and accessible labels for icon-only controls.
- Keyboard focus handling for the custom alert dialog.
- Reduced-motion support.
- Offline app-shell additions and a dedicated fallback page.
- Node.js 22 selected in `firebase.json` for the next Functions deployment.
- Automated coverage for news parsing, limits, image filtering, and cache headers.

## Deliberately not enforced in this change

- Firebase App Check enforcement requires a registered production reCAPTCHA Enterprise site key and metrics review first.
- Removing all CSP `unsafe-inline` allowances requires a separate migration of existing inline styles and reCAPTCHA compatibility testing.
- The external Lucide dependency should be self-hosted or protected with SRI after its exact production artifact is pinned and verified.

## Production verification

After merge:

1. Confirm the Netlify production deployment succeeds.
2. Open the home and news pages twice; the second visit should render cached news immediately.
3. Verify phone login, registration, chat, member management, and push notifications.
4. Deploy Firebase Functions so the `nodejs22` runtime selection takes effect.
5. Re-run Lighthouse and ZAP passive scanning against production.
