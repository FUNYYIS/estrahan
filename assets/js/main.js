// ===============================
// Firebase Imports
// ===============================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    RecaptchaVerifier,
    signInWithPhoneNumber,
    signOut,
    onAuthStateChanged,
    PhoneAuthProvider,
    signInWithCredential
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    collection,
    addDoc,
    query,
    onSnapshot,
    serverTimestamp,
    updateDoc,
    orderBy
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ===============================
// Firebase Config
// ===============================
const firebaseConfig = {
    apiKey: "AIzaSyCoIy5Yf3nvkpbp9l43590snBZui86uSXY",
    authDomain: "estrahaapp-9e327.firebaseapp.com",
    projectId: "estrahaapp-9e327",
    storageBucket: "estrahaapp-9e327.appspot.com",
    messagingSenderId: "198308357962",
    appId: "1:198308357962:web:63b5b267e738efd54a83b3"
};

// ===============================
// Init Firebase
// ===============================
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const ADMIN_UID = "tquFv8nhU3ZPGgqumfCo3Hx67k02";

// ===============================
// UI Elements
// ===============================
const pageContent = document.getElementById('page-content');
const bottomNav = document.getElementById('bottom-nav');
const customAlert = document.getElementById('custom-alert');
const alertMessage = document.getElementById('alert-message');
const alertCloseBtn = document.getElementById('alert-close-btn');

// ===============================
// Helpers
// ===============================
function showAlert(msg) {
    alertMessage.textContent = msg;
    customAlert.style.display = 'flex';
}

alertCloseBtn.addEventListener('click', () => {
    customAlert.style.display = 'none';
});

// ===============================
// THEME
// ===============================
function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
}

function loadTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    applyTheme(saved);
}

// ===============================
// RECAPTCHA FIX (IMPORTANT)
// ===============================
function setupRecaptcha(containerId) {
    try {
        if (window.recaptchaVerifier) {
            return window.recaptchaVerifier;
        }

        window.recaptchaVerifier = new RecaptchaVerifier(
            auth,
            containerId,
            {
                size: 'invisible'
            }
        );

        return window.recaptchaVerifier;

    } catch (err) {
        console.error(err);
        showAlert("خطأ في إعداد التحقق reCAPTCHA");
    }
}

// ===============================
// PHONE NORMALIZER FIX
// ===============================
function normalizePhone(phone) {
    phone = phone.trim();

    if (phone.startsWith("05")) {
        phone = "+966" + phone.substring(1);
    } else if (phone.startsWith("5")) {
        phone = "+966" + phone;
    } else if (!phone.startsWith("+")) {
        phone = "+966" + phone;
    }

    return phone;
}

// ===============================
// AUTH - SEND CODE
// ===============================
async function handleSendCode(e) {
    e.preventDefault();

    let phoneNumber = document.getElementById('phone-number').value;
    phoneNumber = normalizePhone(phoneNumber);

    const appVerifier = setupRecaptcha("recaptcha-container");

    try {
        const confirmationResult = await signInWithPhoneNumber(
            auth,
            phoneNumber,
            appVerifier
        );

        sessionStorage.setItem("verificationId", confirmationResult.verificationId);

        showAlert("تم إرسال رمز التحقق");

        document.getElementById('phone-form').style.display = "none";
        document.getElementById('code-form').style.display = "block";

    } catch (err) {
        console.error("SMS ERROR:", err);
        showAlert("فشل إرسال الرمز. تأكد من الرقم أو حاول لاحقًا.");
    }
}

// ===============================
// AUTH - VERIFY CODE
// ===============================
async function handleVerifyCode(e) {
    e.preventDefault();

    const code = document.getElementById('verification-code').value;
    const verificationId = sessionStorage.getItem("verificationId");

    if (!verificationId) {
        showAlert("انتهت الجلسة، أعد المحاولة");
        return;
    }

    try {
        const credential = PhoneAuthProvider.credential(verificationId, code);
        await signInWithCredential(auth, credential);

        sessionStorage.removeItem("verificationId");

    } catch (err) {
        console.error(err);
        showAlert("رمز التحقق غير صحيح");
    }
}

// ===============================
// LISTEN AUTH STATE
// ===============================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        bottomNav.style.display = "flex";
        await renderPage("#home");
    } else {
        bottomNav.style.display = "none";
        await renderPage("#login");
    }
});

// ===============================
// SIMPLE ROUTER
// ===============================
const routes = {
    "#login": "login.html",
    "#home": "home.html",
    "#members": "members.html",
    "#payments": "payments.html"
};

async function renderPage(hash) {
    const file = routes[hash] || "login.html";

    const res = await fetch("pages/" + file);
    const html = await res.text();

    pageContent.innerHTML = html;

    if (hash === "#login") {
        document.getElementById("phone-form")
            ?.addEventListener("submit", handleSendCode);

        document.getElementById("code-form")
            ?.addEventListener("submit", handleVerifyCode);

        setupRecaptcha("recaptcha-container");
    }
}

// ===============================
// INIT
// ===============================
function initApp() {
    loadTheme();

    window.addEventListener("hashchange", () => {
        renderPage(window.location.hash);
    });

    renderPage(window.location.hash || "#login");
}

initApp();