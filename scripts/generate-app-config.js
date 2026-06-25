const fs = require('node:fs');

const siteKey = process.env.FIREBASE_APPCHECK_SITE_KEY || '';
const isLocalBuild = ['1', 'true'].includes(String(process.env.ESTRAHA_LOCAL_BUILD || '').toLowerCase());
const debugToken = isLocalBuild ? process.env.FIREBASE_APPCHECK_DEBUG_TOKEN || '' : '';

const content = `window.ESTRAHA_APP_CONFIG = window.ESTRAHA_APP_CONFIG || {
  appCheckSiteKey: ${JSON.stringify(siteKey)},
  appCheckDebugToken: ${JSON.stringify(debugToken)}
};
`;

fs.writeFileSync('assets/js/app-config.js', content);
console.log(siteKey
  ? 'Generated App Check runtime config with a public site key.'
  : 'Generated App Check runtime config without a site key; App Check will stay in monitoring setup mode.');
