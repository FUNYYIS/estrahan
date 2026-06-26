import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  PhoneAuthProvider,
  signInWithCredential
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyCoIy5Yf3nvkpbp9l43590snBZui86uSXY",
  authDomain: "estrahaapp-9e327.firebaseapp.com",
  projectId: "estrahaapp-9e327",
  storageBucket: "estrahaapp-9e327.firebasestorage.app",
  messagingSenderId: "198308357962",
  appId: "1:198308357962:web:63b5b267e738efd54a83b3"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const functions = getFunctions(app, 'us-central1');

let recaptchaVerifier = null;
let recaptchaContainerId = '';
let verificationId = sessionStorage.getItem('registerFirebaseVerificationId') || '';

function showAlert(message) {
  const alertMessage = document.getElementById('alert-message');
  const customAlert = document.getElementById('custom-alert');
  const alertCloseBtn = document.getElementById('alert-close-btn');

  if (alertMessage && customAlert) {
    alertMessage.textContent = message;
    customAlert.removeAttribute('inert');
    customAlert.setAttribute('aria-hidden', 'false');
    customAlert.style.display = 'flex';
    requestAnimationFrame(() => alertCloseBtn?.focus({ preventScroll: true }));
    return;
  }

  window.alert(message);
}

function setStatus(id, message = '') {
  const element = document.getElementById(id);
  if (element) element.textContent = message;
}

function setLoading(form, isLoading, loadingText = 'جاري المعالجة...') {
  const button = form?.querySelector('button[type="submit"]');
  if (!button) return;

  if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent;
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : button.dataset.defaultText;
}

function normalizeSaudiPhone(value = '') {
  const cleaned = String(value).trim().replace(/[\s-]/g, '');

  if (!cleaned) return '';
  if (cleaned.startsWith('+9665') && cleaned.length === 13) return cleaned;
  if (cleaned.startsWith('009665') && cleaned.length === 14) return `+${cleaned.slice(2)}`;
  if (cleaned.startsWith('9665') && cleaned.length === 12) return `+${cleaned}`;
  if (cleaned.startsWith('05') && cleaned.length === 10) return `+966${cleaned.slice(1)}`;
  if (cleaned.startsWith('5') && cleaned.length === 9) return `+966${cleaned}`;

  return cleaned.startsWith('+') ? cleaned : `+966${cleaned}`;
}

function setupRecaptcha() {
  const container = document.getElementById('register-recaptcha-container');
  if (!container) return null;

  if (recaptchaVerifier && recaptchaContainerId === container.id) return recaptchaVerifier;

  try {
    recaptchaVerifier?.clear?.();
  } catch (_) {}

  recaptchaContainerId = container.id;
  recaptchaVerifier = new RecaptchaVerifier(auth, container.id, {
    size: 'invisible',
    callback: () => setStatus('register-phone-status', 'تم التحقق، نرسل الرمز الآن...'),
    'expired-callback': () => {
      setStatus('register-phone-status', 'انتهى تحقق reCAPTCHA، أرسل الرمز مرة ثانية.');
      resetRecaptcha();
    },
    'error-callback': () => {
      setStatus('register-phone-status', 'ما ضبط تحقق reCAPTCHA. جرّب مرة ثانية.');
      resetRecaptcha();
    }
  });

  recaptchaVerifier.render().catch((error) => {
    console.warn('Register reCAPTCHA render failed:', error);
  });

  return recaptchaVerifier;
}

function resetRecaptcha() {
  try {
    recaptchaVerifier?.clear?.();
  } catch (_) {}
  recaptchaVerifier = null;
  recaptchaContainerId = '';
}

function showStep(step) {
  const phoneForm = document.getElementById('register-phone-form');
  const codeForm = document.getElementById('register-code-form');
  const profileForm = document.getElementById('register-profile-form');

  if (phoneForm) phoneForm.hidden = step !== 'phone';
  if (codeForm) codeForm.hidden = step !== 'code';
  if (profileForm) profileForm.hidden = step !== 'profile';
}

function getSendCodeErrorMessage(error) {
  const code = error?.code || '';

  if (code === 'auth/invalid-phone-number') return 'صيغة الرقم ما هي صحيحة. اكتب الرقم مثل 05XXXXXXXX.';
  if (code === 'auth/too-many-requests') return 'كثرت الطلبات شوي. جرّب بعدين.';
  if (code === 'auth/unauthorized-domain') return 'الدومين غير مصرح في Firebase Authentication.';
  if (code === 'auth/invalid-app-credential') return 'في مشكلة بالتحقق. تأكد من إعدادات Firebase والنطاق.';
  if (code === 'auth/captcha-check-failed') return 'ما ضبط تحقق reCAPTCHA. جرّب مرة ثانية.';

  return 'ما قدرنا نرسل الرمز. تأكد من الرقم وجرب.';
}

function getVerifyCodeErrorMessage(error) {
  const code = error?.code || '';

  if (code === 'auth/invalid-verification-code') return 'الرمز اللي دخلته غير صحيح. تأكد وجرب.';
  if (code === 'auth/code-expired') return 'انتهت صلاحية الرمز. اطلب رمز جديد.';
  if (code === 'auth/invalid-credential') return 'بيانات التحقق ما هي صحيحة.';

  return 'رمز الدخول غير صحيح.';
}

function getRegistrationErrorMessage(error) {
  const code = error?.code || '';

  if (code.includes('permission-denied')) return 'رمز الدعوة غير صحيح.';
  if (code.includes('invalid-argument')) return 'تأكد من الاسم ورمز الدعوة.';
  if (code.includes('already-exists')) return 'هذا الحساب مسجل مسبقاً.';
  if (code.includes('unauthenticated')) return 'تحقق من رقم جوالك أولاً.';
  if (code.includes('unavailable') || code.includes('deadline-exceeded')) return 'تعذر الاتصال بخدمة التسجيل. حاول مرة ثانية.';
  if (code.includes('failed-precondition')) return 'التسجيل غير متاح حالياً. تواصل مع مسؤول الاستراحة.';

  return 'فشل التسجيل. تأكد من البيانات وحاول مرة ثانية.';
}

async function handleSendRegisterCode(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const input = document.getElementById('register-phone-number');
  const phoneNumber = normalizeSaudiPhone(input?.value || '');

  if (!phoneNumber || !/^\+9665\d{8}$/.test(phoneNumber)) {
    showAlert('اكتب رقم جوال سعودي صحيح مثل 05XXXXXXXX.');
    return;
  }

  const verifier = setupRecaptcha();
  if (!verifier) {
    showAlert('يتم تحضير التحقق... حاول مرة ثانية بعد قليل.');
    return;
  }

  setLoading(form, true, 'جاري إرسال الرمز...');
  setStatus('register-phone-status', 'نجهز التحقق ونرسل لك الرمز...');

  try {
    const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, verifier);
    verificationId = confirmationResult.verificationId;
    sessionStorage.setItem('registerFirebaseVerificationId', verificationId);
    setStatus('register-code-status', 'وصل الرمز. دخّله هنا وكمل.');
    showStep('code');
  } catch (error) {
    console.error('Register SMS error:', error);
    showAlert(getSendCodeErrorMessage(error));
    setStatus('register-phone-status', '');
    resetRecaptcha();
  } finally {
    setLoading(form, false);
  }
}

async function handleVerifyRegisterCode(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const code = document.getElementById('register-verification-code')?.value.trim();

  if (!code) {
    showAlert('اكتب رمز الدخول يا ذيب.');
    return;
  }

  if (!verificationId) {
    showAlert('انتهت مهلة الرمز. اطلب رمز جديد.');
    showStep('phone');
    return;
  }

  setLoading(form, true, 'جاري التحقق...');
  setStatus('register-code-status', 'نتأكد من الرمز...');

  try {
    const credential = PhoneAuthProvider.credential(verificationId, code);
    await signInWithCredential(auth, credential);
    sessionStorage.removeItem('registerFirebaseVerificationId');
    verificationId = '';
    setStatus('register-profile-status', 'تم التحقق من رقمك. كمل الاسم ورمز الدعوة.');
    showAlert('تم التحقق من رقمك. كمل الاسم ورمز الدعوة.');
    showStep('profile');
  } catch (error) {
    console.error('Register verification error:', error);
    showAlert(getVerifyCodeErrorMessage(error));
    setStatus('register-code-status', '');
  } finally {
    setLoading(form, false);
  }
}

async function handleCompleteRegisterProfile(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const user = auth.currentUser;
  const name = document.getElementById('register-name')?.value.trim();
  const inviteCode = document.getElementById('register-invite-code')?.value.trim();

  if (!user) {
    showAlert('تحقق من رقم جوالك أولاً.');
    showStep('phone');
    return;
  }

  if (!name) {
    showAlert('اكتب اسمك يا طويل العمر.');
    return;
  }

  if (!inviteCode) {
    showAlert('اكتب رمز الدعوة.');
    return;
  }

  setLoading(form, true, 'جاري التسجيل...');
  setStatus('register-profile-status', 'نجهز عضويتك...');

  try {
    const completeRegistration = httpsCallable(functions, 'completeRegistration');
    await completeRegistration({ name, inviteCode });
    showAlert('تم تسجيلك بنجاح، حيّاك الله.');
    window.location.hash = '#home';
    window.location.reload();
  } catch (error) {
    console.error('Register profile completion error:', error);
    showAlert(getRegistrationErrorMessage(error));
    setStatus('register-profile-status', '');
  } finally {
    setLoading(form, false);
  }
}

function bindRegisterPage() {
  const page = document.querySelector('.register-auth-page');
  if (!page || page.dataset.registerBound === 'true') return;

  page.dataset.registerBound = 'true';

  document.getElementById('register-phone-form')?.addEventListener('submit', handleSendRegisterCode);
  document.getElementById('register-code-form')?.addEventListener('submit', handleVerifyRegisterCode);
  document.getElementById('register-profile-form')?.addEventListener('submit', handleCompleteRegisterProfile);

  document.getElementById('register-change-phone')?.addEventListener('click', () => {
    verificationId = '';
    sessionStorage.removeItem('registerFirebaseVerificationId');
    resetRecaptcha();
    showStep('phone');
  });

  if (auth.currentUser) {
    showStep('profile');
    setStatus('register-profile-status', 'رقمك متحقق. كمل الاسم ورمز الدعوة.');
  } else if (verificationId) {
    showStep('code');
  } else {
    showStep('phone');
    setupRecaptcha();
  }
}

const observer = new MutationObserver(bindRegisterPage);
observer.observe(document.getElementById('page-content') || document.body, {
  childList: true,
  subtree: true
});

window.addEventListener('hashchange', () => {
  if (window.location.hash === '#register') {
    window.setTimeout(bindRegisterPage, 0);
  }
});

bindRegisterPage();
