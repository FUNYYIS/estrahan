const fs = require('node:fs');

const DEFAULT_APPCHECK_SITE_KEY = '6LefADUtAAAAADEsmCDdvhNJl6RcDbNqMv88YR1o';
const siteKey = process.env.FIREBASE_APPCHECK_SITE_KEY || DEFAULT_APPCHECK_SITE_KEY;
const isLocalBuild = ['1', 'true'].includes(String(process.env.ESTRAHA_LOCAL_BUILD || '').toLowerCase());
const debugToken = isLocalBuild ? process.env.FIREBASE_APPCHECK_DEBUG_TOKEN || '' : '';

const content = `// Public reCAPTCHA Enterprise site key for Firebase App Check; this is not a private secret.
window.ESTRAHA_APP_CONFIG = window.ESTRAHA_APP_CONFIG || {
  appCheckSiteKey: ${JSON.stringify(siteKey)},
  appCheckDebugToken: ${JSON.stringify(debugToken)}
};

function routeDirectRegisterToLogin() {
  const hasLoginVerification = Boolean(sessionStorage.getItem('firebaseVerificationId'));

  if (window.location.hash === '#register' && !hasLoginVerification) {
    sessionStorage.setItem('estraha-register-login-tip', 'true');
    window.location.replace('#login');
  }
}

window.addEventListener('DOMContentLoaded', routeDirectRegisterToLogin);
window.addEventListener('hashchange', routeDirectRegisterToLogin);
`;

fs.writeFileSync('assets/js/app-config.js', content);
console.log('Generated App Check runtime config with a public site key.');
