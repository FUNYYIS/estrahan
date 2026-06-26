window.ESTRAHA_APP_CONFIG = window.ESTRAHA_APP_CONFIG || {
  appCheckSiteKey: '',
  appCheckDebugToken: ''
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
