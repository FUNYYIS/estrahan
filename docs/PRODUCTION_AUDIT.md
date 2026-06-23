# Production Readiness Audit

Date: 2026-06-23
Repository: `FUNYYIS/estrahan`
Local working copy: `/Users/funyas/estrahan`
Baseline branch: `origin/main` at `a5e243c`
Audit branch: `audit/production-readiness-baseline`

This document is a factual baseline and issue inventory. It does not claim the app is perfectly secure or production complete. Several items require Firebase Console, Google Cloud Console, Netlify, real-device, or real-user testing.

## Phase 0 Scope

This PR is documentation only. No runtime code, rules, service worker files, assets, or deployment configuration were changed.

Open PR dependency reviewed:

- PR #12: `fix/phase1-match-functions-reliability-v2` -> `main`, title `Phase 1: Improve match function reliability`, state open, not merged.
- Overlap: PR #12 addresses reliability for `checkUpcomingMatches`, helper extraction, and tests. This audit documents that dependency and does not duplicate the implementation.

## Baseline Inventory

- Tracked files: 5,583.
- Tracked `functions/node_modules` files: 5,541.
- Non-`node_modules` JavaScript files: 7, about 217,878 bytes total.
- CSS files: 4, about 226,904 bytes total.
- HTML page partials under `pages/`: 14.
- Largest non-`node_modules` files:
  - `assets/images/shagrdiyah-desert-bg.png`: about 1.7 MB.
  - `assets/images/riyadh-skyline-bg.jpg`: about 1.0 MB.
  - `assets/images/estraha-logo.svg`: about 220 KB.
  - `assets/css/main.css`: about 212 KB, 9,271 lines.
  - `assets/js/main.js`: about 148 KB, 3,584 lines.
  - `functions/index.js`: about 40 KB, 1,263 lines.
- Potential backup or temporary files outside `functions/node_modules`: none found by name patterns `*backup*`, `*.bak`, `*.tmp`, `*.old`, `*.zip`, `.DS_Store`.
- Current automated tests on `main`: no root `package.json`; `functions/package.json` has dependencies but no `scripts.test`.
- Link/cache smoke checks:
  - Checked `index.html` plus all `pages/*.html` `href` and `src` values: no missing local paths found.
  - Checked route hashes against known routes: no invalid hash found.
  - Checked duplicate static HTML IDs: none found.
  - Checked `service-worker.js` app shell URLs: 34 URLs, no missing local files.
  - Checked `manifest.json` icon paths: no missing icon files.

## Deployment Architecture

- Netlify serves a static Arabic RTL SPA from the repository root.
- Netlify Functions are configured from `netlify/functions`.
- Firebase project alias is in `.firebaserc`: `estrahaapp-9e327`.
- Firebase services in use:
  - Firebase Phone Authentication.
  - Firestore.
  - Firebase Storage.
  - Firebase Cloud Functions, Node.js 20.
  - Firebase Cloud Messaging.
- PWA service worker is `service-worker.js`.
- FCM worker entry `firebase-messaging-sw.js` imports `/service-worker.js`.
- Netlify SPA fallback redirects all unmatched routes to `/index.html`.

## External APIs

- Firebase Web SDK from `https://www.gstatic.com/firebasejs/11.6.1/...`.
- Lucide from `https://unpkg.com/lucide@0.468.0/...`.
- Google Fonts.
- Google reCAPTCHA / Firebase Auth endpoints.
- Aladhan prayer and qibla APIs.
- Open-Meteo weather API.
- TheSportsDB match APIs.
- GitHub raw World Cup fallback data.
- Al Jazeera RSS through rss2json / AllOrigins fallback.
- Al Arabiya RSS/page scraping through Netlify functions.
- Al Arabiya image proxy through Netlify function.

## Current Security Controls

- Firestore has a deny-all fallback in `firestore.rules`.
- Firestore admin checks use a fixed admin UID in rules.
- Cloud Functions privileged callables use `assertAdmin(request)` for admin actions.
- Registration invite code is a Firebase Functions secret, not committed as a literal invite code.
- Firestore rules prevent users from changing payment status or admin-only app settings.
- FCM tokens are user-owned for create/update/delete and listable by admin only.
- Storage writes are admin-only.
- Netlify headers include HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and a CSP.
- News links using `target="_blank"` in audited JavaScript include `rel="noopener noreferrer"`.

## Findings

### Confirmed Security Vulnerability

#### SEC-001: Public Storage image upload rules allow SVG uploads to publicly readable paths

- Evidence: `storage.rules:10-14` defines `isImage(maxSize)` as `request.resource.contentType.matches('image/.*')`; `storage.rules:22-40` allow admin uploads to public-read paths using `isImage`.
- Exact file: `storage.rules`.
- Exact function or selector: `isImage(maxSize)`; matches `/theme-backgrounds/{fileName}`, `/theme-logos/{fileName}`, `/splash-images/{fileName}`.
- Severity: High.
- User impact: An admin or compromised admin session could upload `image/svg+xml` to public paths. SVG can contain active content depending on browser and embedding context, and public theme/logo/splash URLs are later rendered in the app.
- Reproduction method: In a non-production Firebase Storage emulator or staging project, attempt an admin upload with content type `image/svg+xml` to `theme-logos/test.svg`.
- Recommended fix: Restrict image uploads to a strict allowlist such as `image/png`, `image/jpeg`, `image/webp`, and optionally `image/gif`; reject `image/svg+xml` for uploaded runtime assets unless sanitized and served as attachment.
- Risk of fixing it: Existing SVG uploads in Storage, if any, may stop being replaceable or displayed as intended.
- Required testing: Storage Rules emulator tests for allowed PNG/JPEG/WebP and rejected SVG/HTML; manual admin upload tests.
- Needs console access or deployment: Requires Storage Rules deployment to take effect.

### Security Hardening Recommendation

#### SEC-002: Firestore user list exposes all user profile documents to active members

- Evidence: `firestore.rules:34-36` allow `get` and `list` on `/users/{userId}` for any `isActiveMember()`.
- Exact file: `firestore.rules`.
- Exact function or selector: `match /users/{userId}`.
- Severity: Medium.
- User impact: Active members can read all user documents. This may be intended for the members page, but it also exposes phone numbers and payment status if present in user documents.
- Reproduction method: Sign in as a non-admin active member and query `users`.
- Recommended fix: Decide whether member directory requires full user documents. If not, split public member profile fields into a separate collection or restrict visible fields through Cloud Functions.
- Risk of fixing it: Members page, payments views, and late-payment UI may depend on current broad reads.
- Required testing: Members, payments, admin member management, and disabled-user flows.
- Needs console access or deployment: Requires Firestore Rules deployment and possibly data model changes.

#### SEC-003: FCM token topic map is not field-validated

- Evidence: `firestore.rules:76-80` allow users to create/update `topics` as long as the top-level keys are allowed, but do not validate topic names or boolean values.
- Exact file: `firestore.rules`.
- Exact function or selector: `match /fcmTokens/{tokenId}` create/update rule.
- Severity: Medium.
- User impact: A signed-in user can write arbitrary topic fields under their own token document. This is not a privilege escalation by itself, but it can pollute targeting logic and future topic assumptions.
- Reproduction method: Authenticated user writes `topics: { unexpected: "yes" }` to their own token.
- Recommended fix: Validate `topics` keys and require boolean values for known topics such as `matches`, `payments`, `prayer`, and `general`.
- Risk of fixing it: Older token docs with unexpected structure may fail updates until normalized.
- Required testing: Notification settings toggles, FCM token registration, admin broadcast/test reports.
- Needs console access or deployment: Requires Firestore Rules deployment.

#### SEC-004: Netlify CSP allows broad image sources and inline script/style

- Evidence: `netlify.toml:26` includes `script-src 'unsafe-inline'`, `style-src 'unsafe-inline'`, and `img-src ... https:`.
- Exact file: `netlify.toml`.
- Exact function or selector: `Content-Security-Policy`.
- Severity: Medium.
- User impact: The broad `https:` image source and inline allowances reduce CSP containment if an injection issue appears elsewhere.
- Reproduction method: Inspect response headers on Netlify preview or production.
- Recommended fix: Inventory required inline scripts/styles and external image domains, then tighten CSP incrementally. Do not tighten before verifying Firebase Auth, reCAPTCHA, FCM, news images, icons, and theme uploads.
- Risk of fixing it: Over-tightening can break Phone Auth, reCAPTCHA, news, icons, or PWA behavior.
- Required testing: Full auth, route, news, notification, and admin smoke tests in Netlify preview.
- Needs console access or deployment: Requires Netlify deploy to verify.

### Functional Bug

#### BUG-001: PWA asset version values are inconsistent

- Evidence: `assets/js/main.js:55` has `APP_ASSET_VERSION = '254'`; `index.html:25-28` uses query versions `257` and `265`; `service-worker.js:1` uses `estraha-cache-v265`.
- Exact files: `assets/js/main.js`, `index.html`, `service-worker.js`.
- Exact function or selector: `APP_ASSET_VERSION`, asset query strings, `CACHE_NAME`.
- Severity: Medium.
- User impact: Installed PWA users may see stale page partials or mixed CSS/JS after deploys, especially when service worker cache and fetch query versions disagree.
- Reproduction method: Compare the constants and query strings; install the PWA, deploy a partial change, and observe whether cached partials refresh predictably.
- Recommended fix: Create a small PWA versioning PR that aligns `APP_ASSET_VERSION`, all JS/CSS query strings, and `CACHE_NAME`.
- Risk of fixing it: Forces cache refresh; may temporarily increase network traffic.
- Required testing: Installed PWA update flow, route partial loading, service-worker activation.
- Needs console access or deployment: Requires Netlify deployment and real browser/PWA testing.

### Reliability Issue

#### REL-001: Match notification schedule can still fail the whole run on one error

- Evidence: `functions/index.js:33-120` has no top-level `try/catch` and no per-match isolation around Firestore/FCM operations.
- Exact file: `functions/index.js`.
- Exact function or selector: `exports.checkUpcomingMatches`.
- Severity: Medium.
- User impact: One API, Firestore, or malformed match failure can stop the scheduled run and delay match notifications.
- Reproduction method: Throw from a match source or from one match notification write in a staging function run.
- Recommended fix: Do not implement here; PR #12 already covers this with top-level and per-match error isolation.
- Risk of fixing it: Low if PR #12 remains scoped.
- Required testing: `node --check functions/index.js`, helper tests from PR #12, Cloud Functions logs after deploy.
- Needs console access or deployment: Requires Firebase Functions deployment for production effect.

#### REL-002: Netlify Al Arabiya image proxy accepts and serves SVG image responses

- Evidence: `netlify/functions/alarabiya-image.js:31` advertises `image/svg+xml`; `netlify/functions/alarabiya-image.js:40-42` accepts any `content-type` starting with `image/`; response is public at `netlify/functions/alarabiya-image.js:50-58`.
- Exact file: `netlify/functions/alarabiya-image.js`.
- Exact function or selector: `exports.handler`.
- Severity: Medium.
- User impact: A compromised or unexpected upstream image response from allowed hosts could return SVG through the proxy.
- Reproduction method: In staging, request an allowed-host URL that returns `image/svg+xml`.
- Recommended fix: Restrict proxy responses to raster image MIME types and consider adding `X-Content-Type-Options: nosniff`.
- Risk of fixing it: Some legitimate SVG images, if currently used, would stop loading.
- Required testing: Al Arabiya news image rendering and fallback states.
- Needs console access or deployment: Requires Netlify deploy.

### Performance Issue

#### PERF-001: Tracked `functions/node_modules` dominates repository size and file count

- Evidence: `git ls-files functions/node_modules | wc -l` returns 5,541 tracked files; total tracked files are 5,583.
- Exact file: `functions/node_modules/**`.
- Exact function or selector: Not applicable.
- Severity: High for repository hygiene and CI performance; not a runtime app security issue.
- User impact: Slow clones, noisy reviews, high repository churn, and higher risk of accidentally committing dependency artifacts.
- Reproduction method: Run `git ls-files functions/node_modules | head` and count tracked files.
- Recommended fix: Separate repository-hygiene PR: confirm `functions/package.json` and `functions/package-lock.json`, run `cd functions && npm ci`, run tests/checks, then `git rm -r functions/node_modules` and rely on dependency manifests.
- Risk of fixing it: Functions deployment must still install dependencies correctly; local contributors need to run `npm ci`.
- Required testing: Clean clone, `cd functions && npm ci`, syntax checks, any tests, Firebase Functions deploy dry-run if available.
- Needs console access or deployment: No console access required for cleanup; deployment should be tested later.

#### PERF-002: Large global CSS with many high-specificity overrides

- Evidence: `assets/css/main.css` is 9,271 lines; `rg "!important" assets/css/*.css` counted 2,524 occurrences.
- Exact file: `assets/css/main.css`.
- Exact function or selector: Many global selectors and overrides.
- Severity: Medium.
- User impact: Harder maintenance, higher regression risk, and potential style conflicts across pages.
- Reproduction method: Count CSS lines and `!important` occurrences.
- Recommended fix: Create `docs/CSS_REFACTOR_PLAN.md`, then move one isolated component per PR. Avoid broad rewrites.
- Risk of fixing it: Visual regressions in RTL/mobile/PWA layouts.
- Required testing: Screenshot review at requested viewport sizes and route smoke tests.
- Needs console access or deployment: Browser/device testing required; no Firebase console access.

### Accessibility Issue

#### A11Y-001: Several generated images use empty alt text

- Evidence: `assets/js/main.js:3291` team logos render with `alt=""`; `assets/js/main.js:3324` news images render with `alt=""`; `assets/js/page-fixes.js:60` compact news images render with `alt=""`.
- Exact files: `assets/js/main.js`, `assets/js/page-fixes.js`.
- Exact function or selector: `teamLogoMarkup`, news card rendering, `renderNewsItems`.
- Severity: Low to Medium.
- User impact: Decorative images may be acceptable with empty alt, but team logos and news thumbnails may carry useful context for screen-reader users.
- Reproduction method: Inspect rendered matches/news cards with a screen reader or accessibility tree.
- Recommended fix: Decide which images are decorative. Add meaningful alt text for team logos and article thumbnails when useful.
- Risk of fixing it: Low; incorrect alt text can be noisy.
- Required testing: Screen-reader labels and visual regression.
- Needs console access or deployment: Browser testing only.

### Design Inconsistency

#### UI-001: Versioned hotfix CSS files indicate fragmented styling

- Evidence: `index.html:25-28` loads `main.css`, `chat-fix.css`, `page-fixes.css`, and `home-layout-fix.css`; `service-worker.js:6-9` caches the same split CSS files.
- Exact files: `index.html`, `service-worker.js`, `assets/css/*.css`.
- Exact function or selector: CSS asset includes.
- Severity: Low to Medium.
- User impact: Styles may become order-dependent and difficult to reason about.
- Reproduction method: Review CSS load order and inspect overlapping selectors.
- Recommended fix: Document CSS architecture first, then merge or modularize one isolated component per PR.
- Risk of fixing it: Visual regressions if order-dependent overrides are moved.
- Required testing: Multi-viewport screenshot audit.
- Needs console access or deployment: Browser testing only.

### Code-Quality Issue

#### CQ-001: `assets/js/main.js` is large and mixes many domains

- Evidence: `assets/js/main.js` is about 3,584 lines and includes routing, auth, admin, chat, payments, matches, news, prayer, theme, FCM, and DOM rendering.
- Exact file: `assets/js/main.js`.
- Exact function or selector: Whole module.
- Severity: Medium.
- User impact: Higher regression risk for small changes, difficult testing, and hard-to-isolate failures.
- Reproduction method: Review file sections and global state.
- Recommended fix: Create `docs/MAIN_JS_REFACTOR_PLAN.md`; extract only pure helpers first in later PRs.
- Risk of fixing it: High if done as a rewrite; low if incremental and tested.
- Required testing: Route smoke tests, auth flow, admin flow, notification flow.
- Needs console access or deployment: Browser and Firebase staging checks.

#### CQ-002: Many `innerHTML` usages require continued data-source review

- Evidence: `rg "innerHTML" assets/js/*.js` counted 50 occurrences. Many use `escapeHtml`, but generated UI includes data from Firestore and external APIs.
- Exact files: `assets/js/main.js`, `assets/js/page-fixes.js`.
- Exact functions/selectors: `loadMembers`, `renderChatMessages`, `loadNews`, `renderNewsItems`, `applySplashSettings`.
- Severity: Medium.
- User impact: Escaping appears present in many locations, but the surface area is large enough that future changes can easily introduce XSS.
- Reproduction method: Review each `innerHTML` sink and trace whether inputs are static, escaped, sanitized, or externally controlled.
- Recommended fix: In a later security-hardening PR, replace high-risk untrusted-data rendering with DOM APIs or audited helper templates.
- Risk of fixing it: Moderate because rendering changes can alter UI.
- Required testing: Chat, members, payments, news, splash/theme settings.
- Needs console access or deployment: Browser and real-data testing.

### Repository-Hygiene Issue

#### RH-001: `.gitignore` already ignores `functions/node_modules`, but tracked files remain

- Evidence: `.gitignore` includes `functions/node_modules/`; `git ls-files functions/node_modules | head` still returns tracked files.
- Exact files: `.gitignore`, `functions/node_modules/**`.
- Exact function or selector: Not applicable.
- Severity: High.
- User impact: New ignores do not affect already tracked dependency files.
- Reproduction method: Run `git ls-files functions/node_modules | head`.
- Recommended fix: Dedicated cleanup PR after verifying clean install and tests.
- Risk of fixing it: Large diff and possible deployment assumptions.
- Required testing: `cd functions && npm ci`, syntax checks, Functions deploy validation in non-production.
- Needs console access or deployment: No console for cleanup; deployment verification later.

#### RH-002: Local stash exists outside working tree

- Evidence: `git log --all --oneline` shows `refs/stash` entry `On main: backup-welcome-before-sync`.
- Exact file: Git metadata, not repository source.
- Exact function or selector: `refs/stash`.
- Severity: Low.
- User impact: Local-only state can confuse future audits if applied accidentally.
- Reproduction method: Run `git stash list`.
- Recommended fix: Ask owner whether to keep, inspect, or drop. Do not drop automatically.
- Risk of fixing it: Dropping could lose user work.
- Required testing: None.
- Needs console access or deployment: No.

### Documentation Issue

#### DOC-001: README has useful basics but lacks full production operations docs

- Evidence: `README.md` includes setup, Firebase secret, deploy snippets, collections, and quick checks, but no full architecture, security model, App Check rollout, testing policy, rollback policy, or PR workflow.
- Exact file: `README.md`.
- Exact function or selector: Not applicable.
- Severity: Medium.
- User impact: Future changes are more likely to miss required console/deployment/manual steps.
- Reproduction method: Review README contents.
- Recommended fix: Add `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/TESTING.md`, `docs/FIREBASE_APP_CHECK.md`, and refactor plans in later documentation PRs.
- Risk of fixing it: Low.
- Required testing: Documentation review.
- Needs console access or deployment: No.

### False Positive or Non-Issue

#### FP-001: Firebase Web API key is present in browser and service worker code

- Evidence: `assets/js/main.js:47` and `service-worker.js:37` contain a Firebase Web API key.
- Exact files: `assets/js/main.js`, `service-worker.js`.
- Exact function or selector: Firebase client config.
- Severity: Not an issue by itself.
- User impact: None by itself; Firebase Web API keys are identifiers, not server credentials.
- Reproduction method: Inspect Firebase Web SDK config.
- Recommended fix: Do not treat this as a secret. Security should rely on Auth, Firestore/Storage rules, App Check, and server-side callable checks.
- Risk of fixing it: Moving it to unavailable runtime env without a build process can break the static app.
- Required testing: None unless changing config.
- Needs console access or deployment: No.

#### FP-002: Static link and service-worker asset checks did not find missing files

- Evidence: Local script checked `index.html` and 14 page files for local `href`/`src` references and checked 34 service-worker URLs.
- Exact files: `index.html`, `pages/*.html`, `service-worker.js`, `manifest.json`.
- Exact function or selector: Static `href`, `src`, `APP_SHELL_URLS`, manifest icons.
- Severity: Non-issue in current baseline.
- User impact: None found.
- Reproduction method: Run the same static checks described in baseline inventory.
- Recommended fix: Add a reusable smoke test in a later testing PR.
- Risk of fixing it: Low.
- Required testing: Automated smoke test.
- Needs console access or deployment: No.

### Requires Console or Manual Verification

#### MAN-001: Firebase App Check readiness is not implemented

- Evidence: No App Check initialization or `docs/FIREBASE_APP_CHECK.md` found in current source.
- Exact files: `assets/js/main.js`, `functions/index.js`, docs directory.
- Exact function or selector: Not applicable.
- Severity: Medium hardening recommendation.
- User impact: App Check could reduce abuse from non-genuine clients, but enforcement can break old installed PWA clients if rushed.
- Reproduction method: Review Firebase Console App Check status and current code.
- Recommended fix: Create `docs/FIREBASE_APP_CHECK.md`; optionally prepare disabled-by-default initialization behind explicit config after approval.
- Risk of fixing it: High if enforcement is enabled without staged monitoring.
- Required testing: Firebase Console monitoring mode, debug-token local workflow, old installed PWA clients.
- Needs console access or deployment: Yes.

#### MAN-002: Real notification delivery cannot be verified statically

- Evidence: FCM service worker exists and notification functions exist, but delivery depends on browser permission, valid device tokens, deployed Functions, and Firebase project state.
- Exact files: `assets/js/main.js`, `service-worker.js`, `functions/index.js`.
- Exact function or selector: FCM registration, `sendAdminTestNotification`, `sendAdminBroadcastNotification`, scheduled functions.
- Severity: Medium.
- User impact: Notifications may appear healthy in code but fail for real users due to permissions, stale tokens, VAPID/domain configuration, or deployment state.
- Reproduction method: Test on real browser/device with notification permission and admin test buttons.
- Recommended fix: Add documented manual notification test matrix and keep invalid-token cleanup.
- Risk of fixing it: Low for docs; medium for code changes.
- Required testing: Real device/browser, Firebase Functions logs, FCM token records.
- Needs console access or deployment: Yes.

#### MAN-003: Visual/PWA standalone quality needs device screenshots

- Evidence: No screenshots were captured in this Phase 0 documentation-only pass.
- Exact files: `assets/css/*.css`, `pages/*.html`, `index.html`.
- Exact function or selector: Full UI.
- Severity: Not classified until visual evidence is collected.
- User impact: Potential mobile overlap, safe-area, keyboard, and PWA standalone issues remain unknown.
- Reproduction method: Test requested viewports: 320x568, 375x812, 390x844, 430x932, 768x1024, 1366x768, plus installed PWA mode.
- Recommended fix: Create `docs/UI_UX_AUDIT.md` with before/after screenshots in a later visual audit PR.
- Risk of fixing it: Visual regressions if broad CSS changes are made.
- Required testing: Browser screenshots and real mobile/PWA testing.
- Needs console access or deployment: Browser/device testing, optionally Netlify preview.

## Recommended PR Order From This Baseline

1. Merge or review PR #12 for match schedule reliability before touching the same Cloud Functions areas.
2. Repository hygiene PR for tracked `functions/node_modules` after clean install verification.
3. Security hardening PR for Storage MIME allowlist and FCM topic validation with emulator/rule tests where practical.
4. PWA version alignment PR for `APP_ASSET_VERSION`, query strings, and `CACHE_NAME`.
5. Testing foundation PR for Node built-in tests and static smoke checks.
6. App Check documentation PR: `docs/FIREBASE_APP_CHECK.md`.
7. `MAIN_JS_REFACTOR_PLAN.md` and `CSS_REFACTOR_PLAN.md` documentation PRs.
8. Incremental JS/CSS fixes only after plans and tests exist.

## Verification Performed For This Audit

- `git fetch origin`
- `git switch main`
- `git pull --ff-only origin main`
- Created branch from latest `origin/main`.
- Queried PR #12 directly and confirmed it is open and unmerged.
- Counted tracked files and confirmed tracked `functions/node_modules`.
- Inspected `.gitignore`, `firebase.json`, `.firebaserc`, `firestore.rules`, `storage.rules`, `netlify.toml`, `manifest.json`, `service-worker.js`, `firebase-messaging-sw.js`, `functions/index.js`, Netlify functions, major JS/CSS/HTML files, README, and route partials.
- Ran static checks for local links, known hash routes, duplicate static HTML IDs, service-worker app-shell paths, and manifest icon paths.
- Searched current source for private key and service-account patterns; none found outside normal Firebase Web config and secret names.

## Not Performed In This Phase

- No Firebase deploy.
- No Netlify deploy.
- No Firestore/Storage Rules deploy.
- No real Firebase data access.
- No real notification sends.
- No Lighthouse run.
- No screenshots.
- No file deletions.
- No runtime code changes.
