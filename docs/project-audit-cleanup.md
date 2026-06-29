# Project audit cleanup notes

## Admin authorization

- The current admin UID is `g0qsFSAGg1dKy10Nnen8Djk6NB53`.
- Keep this value aligned in `assets/js/main/00-core-firebase-settings.js`, `functions/index.js`, `firestore.rules`, `storage.rules`, and `tests/e2e/mocks.js`.
- TODO: migrate admin authorization to Firebase custom claims in a staged rollout. Keep the hardcoded UID until claims are issued, verified in rules, and monitored in production.

## Deleted files proof

- `assets/js/register-auth.js` was removed because the live registration page uses the OTP verification produced by `assets/js/main/05-auth.js`. The deleted file expected a different page structure (`register-phone-form`, `register-code-form`, `register-profile-form`) that is not present in `pages/register.html`.
- `netlify/functions/alarabiya-news.js` was removed after `/api/alarabiya-news` was redirected to `/.netlify/functions/alarabiya-news-v3`. The frontend news provider already calls the v3 endpoint directly.

## Large-file audit

- `assets/js/main.js` is generated from `assets/js/main/*`; edit the source parts and run `npm run build`.
- `assets/css/main.css` is an import wrapper over the split CSS files. The large visual CSS modules should be split only with screenshot coverage because they control the current design identity.
- `functions/index.js` already uses helper modules for match, notification, and rate-limit logic. Further splitting should be done function group by function group with Functions tests and a deployment review.
