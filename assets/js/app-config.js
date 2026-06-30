window.ESTRAHA_APP_CONFIG = window.ESTRAHA_APP_CONFIG || {
  appCheckSiteKey: "",
  appCheckDebugToken: ""
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
