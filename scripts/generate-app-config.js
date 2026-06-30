const fs = require('node:fs');

const siteKey = process.env.FIREBASE_APPCHECK_SITE_KEY || '';
const isLocalBuild = ['1', 'true'].includes(String(process.env.ESTRAHA_LOCAL_BUILD || '').toLowerCase());
const debugToken = isLocalBuild ? process.env.FIREBASE_APPCHECK_DEBUG_TOKEN || '' : '';

const content = `window.ESTRAHA_APP_CONFIG = window.ESTRAHA_APP_CONFIG || {
  appCheckSiteKey: ${JSON.stringify(siteKey)},
  appCheckDebugToken: ${JSON.stringify(debugToken)}
};

function routeDirectRegisterToLogin() {
  const hasLoginVerification = Boolean(sessionStorage.getItem('firebaseVerificationId'));
  const hasRegisterVerification = Boolean(sessionStorage.getItem('registerFirebaseVerificationId'));

  if (window.location.hash === '#register' && !hasLoginVerification && !hasRegisterVerification) {
    sessionStorage.setItem('estraha-register-login-tip', 'true');
    window.location.replace('#login');
  }
}

window.addEventListener('DOMContentLoaded', routeDirectRegisterToLogin);
window.addEventListener('hashchange', routeDirectRegisterToLogin);

window.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('script[data-register-auth-module]')) return;

  const script = document.createElement('script');
  script.type = 'module';
  script.src = 'assets/js/register-auth.js?v=277';
  script.dataset.registerAuthModule = 'true';
  document.body.appendChild(script);
});
`;

fs.writeFileSync('assets/js/app-config.js', content);
console.log(siteKey
  ? 'Generated App Check runtime config with a public site key.'
  : 'Generated App Check runtime config without a site key; App Check will stay in monitoring setup mode.');
