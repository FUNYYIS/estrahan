// Public reCAPTCHA Enterprise site key for Firebase App Check; this is not a private secret.
window.ESTRAHA_APP_CONFIG = window.ESTRAHA_APP_CONFIG || {
  appCheckSiteKey: "6LefADUtAAAAADEsmCDdvhNJl6RcDbNqMv88YR1o",
  appCheckDebugToken: ""
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
