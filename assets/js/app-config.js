window.ESTRAHA_APP_CONFIG = window.ESTRAHA_APP_CONFIG || {
  appCheckSiteKey: '',
  appCheckDebugToken: ''
};

window.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('script[data-register-auth-module]')) return;

  const script = document.createElement('script');
  script.type = 'module';
  script.src = 'assets/js/register-auth.js?v=276';
  script.dataset.registerAuthModule = 'true';
  document.body.appendChild(script);
});
