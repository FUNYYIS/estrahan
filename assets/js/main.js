// استيراد الوظائف اللازمة من حزم Firebase SDK
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
    getDocs,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// إعدادات Firebase الخاصة بتطبيقك
const firebaseConfig = {
  apiKey: "AIzaSyCoIy5Yf3nvkpbp9l43590snBZui86uSXY",
  authDomain: "estrahaapp-9e327.firebaseapp.com",
  projectId: "estrahaapp-9e327",
  storageBucket: "estrahaapp-9e327.appspot.com",
  messagingSenderId: "198308357962",
  appId: "1:198308357962:web:63b5b267e738efd54a83b3"
};


// تهيئة Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const ADMIN_UID = "tquFv8nhU3ZPGgqumfCo3Hx67k02"; //  <-- تم وضع معرف المستخدم الخاص بالمسؤول هنا

// --- عناصر واجهة المستخدم ---
const pageContent = document.getElementById('page-content');
const bottomNav = document.getElementById('bottom-nav');
const customAlert = document.getElementById('custom-alert');
const alertMessage = document.getElementById('alert-message');
const alertCloseBtn = document.getElementById('alert-close-btn');
const appLogo = document.getElementById('app-logo');
const pageTitle = document.getElementById('pageTitle');
const todayLabel = document.getElementById('todayLabel');
const onlineState = document.getElementById('onlineState');
const notifyBtn = document.getElementById('notifyBtn');
const menuBtn = document.getElementById('menuBtn');
const sidebar = document.querySelector('.sidebar');

// --- حالة التطبيق ---
let currentUser = null; 
let tempName = ''; // لتخزين الاسم مؤقتاً عند التسجيل
let unsubscribeChat, unsubscribeMembers, unsubscribePayments;

const routeTitles = {
    '#login': 'تسجيل الدخول',
    '#register': 'حساب جديد',
    '#home': 'الرئيسية',
    '#members': 'الأعضاء',
    '#payments': 'القطة الشهرية',
    '#chat': 'الدردشة',
    '#settings': 'الإعدادات',
    '#profile-settings': 'الملف الشخصي',
    '#notifications-settings': 'التنبيهات',
    '#services': 'الخدمات',
    '#prayer': 'الصلاة',
    '#qibla': 'القبلة',
    '#matches': 'مباريات اليوم',
    '#news': 'الأخبار',
    '#important-links': 'روابط مهمة',
};

function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}

function safeExternalUrl(value, fallback = '#') {
    if (!value) return fallback;

    try {
        const url = new URL(value, window.location.origin);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback;
    } catch {
        return fallback;
    }
}

function cleanupRealtimeListeners() {
    if (unsubscribeChat) {
        unsubscribeChat();
        unsubscribeChat = null;
    }
    if (unsubscribeMembers) {
        unsubscribeMembers();
        unsubscribeMembers = null;
    }
    if (unsubscribePayments) {
        unsubscribePayments();
        unsubscribePayments = null;
    }
}

// --- RecaptchaVerifier Manager ---
const recaptchaManager = {
    verifiers: new Map(), // Map<containerId, RecaptchaVerifier>
    
    getOrCreate(containerId) {
        // Check if verifier already exists and is valid
        if (this.verifiers.has(containerId)) {
            const verifier = this.verifiers.get(containerId);
            // Check if element still exists in DOM
            if (document.getElementById(containerId) && !verifier.destroyed) {
                console.log(`✓ Reusing existing RecaptchaVerifier for ${containerId}`);
                return verifier;
            } else {
                console.log(`✗ Removing dead RecaptchaVerifier for ${containerId}`);
                this.verifiers.delete(containerId);
            }
        }
        
        // Create new verifier
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`✗ Container ${containerId} not found in DOM`);
            return null;
        }
        
        try {
            console.log(`Creating new RecaptchaVerifier for ${containerId}...`);
            const verifier = new RecaptchaVerifier(auth, containerId, {
                'size': 'invisible',
                'callback': (response) => {
                    console.log('✓ reCAPTCHA verification successful');
                },
                'expired-callback': () => {
                    console.warn('⚠ reCAPTCHA expired');
                    this.verifiers.delete(containerId);
                },
                'error-callback': (error) => {
                    console.error('✗ reCAPTCHA error:', error);
                    this.verifiers.delete(containerId);
                }
            });
            
            this.verifiers.set(containerId, verifier);
            console.log(`✓ RecaptchaVerifier created successfully for ${containerId}`);
            return verifier;
        } catch (error) {
            console.error(`✗ Failed to create RecaptchaVerifier for ${containerId}:`, error);
            return null;
        }
    },
    
    destroy(containerId) {
        if (this.verifiers.has(containerId)) {
            try {
                const verifier = this.verifiers.get(containerId);
                if (verifier && !verifier.destroyed) {
                    verifier.clear();
                }
                this.verifiers.delete(containerId);
                console.log(`✓ Destroyed RecaptchaVerifier for ${containerId}`);
            } catch (error) {
                console.error(`Error destroying verifier for ${containerId}:`, error);
                this.verifiers.delete(containerId);
            }
        }
    },
    
    destroyAll() {
        for (const [containerId] of this.verifiers) {
            this.destroy(containerId);
        }
    }
};

// --- وظائف مساعدة ---
function showAlert(message) {
    alertMessage.textContent = message;
    customAlert.style.display = 'flex';
}
alertCloseBtn.addEventListener('click', () => {
    customAlert.style.display = 'none';
});

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showAlert('تم نسخ الآيبان بنجاح!');
    }).catch(err => {
        showAlert('فشل النسخ، حاول مرة أخرى.');
    });
}
window.copyToClipboard = copyToClipboard;

// --- إدارة الوضع الليلي ---
function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
}

function toggleTheme() {
    const newTheme = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem('al-istiraha-theme', newTheme);
    applyTheme(newTheme);
}

function loadTheme() {
    const savedTheme = localStorage.getItem('al-istiraha-theme') || 'light';
    applyTheme(savedTheme);
}

function setOnlineState() {
    if (!onlineState) return;
    onlineState.textContent = navigator.onLine ? 'متصل' : 'وضع عدم الاتصال';
}

menuBtn?.addEventListener('click', () => sidebar?.classList.toggle('open'));
notifyBtn?.addEventListener('click', async () => {
    if (!('Notification' in window)) {
        showAlert('متصفحك لا يدعم إشعارات الويب.');
        return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        new Notification('Al Istiraha', {
            body: 'تم تفعيل الإشعارات.',
            icon: 'assets/images/al-istiraha-icon.svg'
        });
    }
});
window.addEventListener('online', setOnlineState);
window.addEventListener('offline', setOnlineState);

// --- نظام التنقل (Router) ---
const routes = {
    '#login': 'login.html',
    '#register': 'register.html',
    '#home': 'home.html',
    '#members': 'members.html',
    '#payments': 'payments.html',
    '#chat': 'chat.html',
    '#settings': 'settings.html',
    '#profile-settings': 'profile-settings.html',
    '#notifications-settings': 'notifications-settings.html',
    '#services': 'services.html',
    '#prayer': 'prayer.html',
    '#qibla': 'qibla.html',
    '#matches': 'matches.html',
    '#news': 'news.html',
    '#important-links': 'important-links.html',
};

const publicRoutes = ['#login', '#register'];

function normalizeHash(hash) {
    return hash && hash.startsWith('#') ? hash : `#${hash || ''}`;
}

function currentPublicRoute() {
    const hash = normalizeHash(window.location.hash);
    return publicRoutes.includes(hash) ? hash : '#login';
}

function updateActiveNav(hash) {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === hash) {
            link.classList.add('active');
        }
    });

    if (pageTitle) pageTitle.textContent = routeTitles[hash] || 'Al Istiraha';
    if (todayLabel) {
        todayLabel.textContent = new Intl.DateTimeFormat('ar-SA', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).format(new Date());
    }
}

async function renderPage(hash) {
    const defaultPage = currentUser ? '#home' : '#login';
    const requestedHash = normalizeHash(hash || defaultPage);
    const isPublicRoute = publicRoutes.includes(requestedHash);
    const currentHash = routes[requestedHash] && (currentUser || isPublicRoute) ? requestedHash : defaultPage;
    const pageFile = routes[currentHash];
    
    if (pageFile) {
        try {
            const response = await fetch(`pages/${pageFile}`);
            if (!response.ok) {
                throw new Error(`Page fetch failed with status ${response.status}`);
            }
            const pageHtml = await response.text();
            pageContent.innerHTML = pageHtml;
            
            // Create lucide icons with retry logic
            const safeCreateIcons = () => {
                if (typeof lucide !== 'undefined' && lucide.createIcons) {
                    try {
                        lucide.createIcons();
                    } catch (error) {
                        console.warn('Error creating lucide icons:', error);
                        setTimeout(safeCreateIcons, 100);
                    }
                } else {
                    setTimeout(safeCreateIcons, 100);
                }
            };
            safeCreateIcons();

            attachEventListeners(currentHash);
            // Normalize page ID for loadPageData
            const normalizedPageId = currentHash.substring(1).replace('#', '');
            loadPageData(normalizedPageId);
            updateActiveNav(currentHash);
            sidebar?.classList.remove('open');
        } catch (error) {
            console.error('Error fetching page:', error);
            pageContent.innerHTML = '<p class="text-center">عفواً، الصفحة غير موجودة.</p>';
        }
    } else {
        // Fallback to default page
        await renderPage(defaultPage);
    }
}

function attachEventListeners(hash) {
    const pageId = hash.substring(1); // remove '#'
    
    if (pageId === 'login') {
        console.log('Setting up login page event listeners');
        
        // Clean up old verifier if switching pages
        recaptchaManager.destroy('recaptcha-container');
        
        const phoneForm = document.getElementById('phone-form');
        const codeForm = document.getElementById('code-form');
        if (phoneForm) phoneForm.addEventListener('submit', (e) => handleSendCode(e, false));
        if (codeForm) codeForm.addEventListener('submit', (e) => handleVerifyCode(e, false));
        
        // Setup recaptcha with validation
        const recaptchaSetupSuccess = setupRecaptcha('recaptcha-container');
        if (!recaptchaSetupSuccess) {
            console.error('Failed to set up reCAPTCHA on login page');
        }
    }
    
    if (pageId === 'register') {
        console.log('Setting up register page event listeners');
        
        // Clean up old verifier if switching pages
        recaptchaManager.destroy('recaptcha-container-register');
        
        const registerForm = document.getElementById('register-form');
        const registerCodeForm = document.getElementById('register-code-form');
        if (registerForm) registerForm.addEventListener('submit', (e) => handleSendCode(e, true));
        if (registerCodeForm) registerCodeForm.addEventListener('submit', (e) => handleVerifyCode(e, true));
        
        // Setup recaptcha with validation
        const recaptchaSetupSuccess = setupRecaptcha('recaptcha-container-register');
        if (!recaptchaSetupSuccess) {
            console.error('Failed to set up reCAPTCHA on register page');
        }
    }
    
    if (pageId === 'settings') {
        const logoutBtn = document.getElementById('logout-button');
        if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
        
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.checked = (localStorage.getItem('al-istiraha-theme') === 'dark');
            themeToggle.addEventListener('change', toggleTheme);
        }
    }
    
    if (pageId === 'chat') {
        const chatForm = document.getElementById('chat-form');
        if (chatForm) chatForm.addEventListener('submit', handleSendMessage);
    }

    if (pageId === 'payments') {
        const copyIbanButton = document.getElementById('copy-iban-button');
        if (copyIbanButton) {
            copyIbanButton.addEventListener('click', () => copyToClipboard('SA00 1234 5678 9012 3456 7890'));
        }
    }
}

function loadPageData(pageId) {
    // Normalize page ID (remove '-page' suffix if present)
    const normalizedPageId = pageId.replace('-page', '');
    
    if (!currentUser && !['login', 'register'].includes(normalizedPageId)) {
        return;
    }
    
    cleanupRealtimeListeners();

    try {
        switch (normalizedPageId) {
            case 'home':
                loadHomePageData();
                break;
            case 'members':
                loadMembers();
                break;
            case 'payments':
                loadPaymentLog();
                break;
            case 'chat':
                loadChat();
                break;
            case 'profile-settings':
                loadProfileData();
                break;
            case 'prayer':
                loadPrayerTimes();
                break;
            case 'qibla':
                initQibla();
                break;
            case 'matches':
                loadMatches();
                break;
            case 'news':
                loadNews();
                break;
        }
    } catch (error) {
        console.error(`Error loading page data for ${normalizedPageId}:`, error);
    }
}

// --- Firebase Auth Handlers ---
function setupRecaptcha(containerId) {
    console.log(`Setting up reCAPTCHA for container: ${containerId}`);
    const verifier = recaptchaManager.getOrCreate(containerId);
    if (verifier) {
        window.recaptchaVerifier = verifier;
        return true;
    } else {
        console.error(`Failed to set up reCAPTCHA for ${containerId}`);
        showAlert('فشل إعداد التحقق. يرجى تحديث الصفحة.');
        return false;
    }
}

async function handleSendCode(e, isRegister = false) {
    e.preventDefault();
    console.log(`handleSendCode called (isRegister=${isRegister})`);
    
    const phoneInputId = isRegister ? 'register-phone-number' : 'phone-number';
    const phoneInput = document.getElementById(phoneInputId);
    
    if (!phoneInput) {
        showAlert('عنصر الهاتف غير موجود. يرجى تحديث الصفحة.');
        return;
    }
    
    let phoneNumber = phoneInput.value.trim();
    
    // Validate phone number format
    if (!phoneNumber) {
        showAlert('الرجاء إدخال رقم جوال صحيح.');
        return;
    }
    
    // Convert Saudi format to international format
    if (phoneNumber.startsWith('05')) {
        phoneNumber = '+966' + phoneNumber.substring(1);
    } else if (!phoneNumber.startsWith('+')) {
        phoneNumber = '+966' + phoneNumber;
    }

    if (isRegister) {
        const nameInput = document.getElementById('register-name');
        if (!nameInput) {
            showAlert('عنصر الاسم غير موجود. يرجى تحديث الصفحة.');
            return;
        }
        tempName = nameInput.value.trim();
        if (!tempName) {
            showAlert('الرجاء إدخال الاسم الكامل.');
            return;
        }
    }

    // Get recaptcha verifier
    const appVerifier = window.recaptchaVerifier;
    if (!appVerifier) {
        console.error('reCAPTCHA verifier not initialized');
        showAlert('يتم تحضير التحقق... حاول مرة أخرى بعد قليل.');
        return;
    }

    console.log(`Sending verification code to: ${phoneNumber}`);
    
    try {
        const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
        console.log('✓ Verification code sent successfully');
        
        // Store verification ID in sessionStorage
        sessionStorage.setItem('firebaseVerificationId', confirmationResult.verificationId);
        if (isRegister) {
            sessionStorage.setItem('tempName', tempName);
        }

        showAlert('تم إرسال رمز التحقق إلى جوالك.');
        if (isRegister) {
            const registerForm = document.getElementById('register-form');
            const registerCodeForm = document.getElementById('register-code-form');
            if (registerForm) registerForm.style.display = 'none';
            if (registerCodeForm) registerCodeForm.style.display = 'block';
        } else {
            const phoneForm = document.getElementById('phone-form');
            const codeForm = document.getElementById('code-form');
            if (phoneForm) phoneForm.style.display = 'none';
            if (codeForm) codeForm.style.display = 'block';
        }
    } catch (error) {
        console.error("✗ SMS Error:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        
        let errorMsg = 'فشل إرسال الرمز. تأكد من صحة الرقم.';
        
        if (error.code === 'auth/invalid-phone-number') {
            errorMsg = 'صيغة رقم الهاتف غير صحيحة. استخدم الصيغة الدولية +966XXXXXXXXX';
        } else if (error.code === 'auth/too-many-requests') {
            errorMsg = 'تم إرسال عدد كبير من الطلبات. حاول لاحقاً.';
        } else if (error.code === 'auth/invalid-app-credential') {
            errorMsg = 'خطأ في بيانات التحقق. تأكد من توافق النطاق.';
        } else if (error.code === 'auth/captcha-check-failed') {
            errorMsg = 'فشل التحقق من reCAPTCHA. حاول مرة أخرى.';
        }
        
        showAlert(errorMsg);
        
        // Reset recaptcha and try to recreate it
        const containerId = isRegister ? 'recaptcha-container-register' : 'recaptcha-container';
        recaptchaManager.destroy(containerId);
        
        // Wait a moment then recreate
        setTimeout(() => {
            const success = setupRecaptcha(containerId);
            if (!success) {
                showAlert('فشل إعادة تعيين التحقق. يرجى تحديث الصفحة.');
            }
        }, 500);
    }
}

async function handleVerifyCode(e, isRegister = false) {
    e.preventDefault();
    console.log(`handleVerifyCode called (isRegister=${isRegister})`);
    
    const codeInputId = isRegister ? 'register-verification-code' : 'verification-code';
    const codeInput = document.getElementById(codeInputId);
    
    if (!codeInput) {
        showAlert('عنصر الرمز غير موجود. يرجى تحديث الصفحة.');
        return;
    }
    
    const code = codeInput.value.trim();
    
    if (!code) {
        showAlert('الرجاء إدخال رمز التحقق.');
        return;
    }
    
    // Get verification ID from sessionStorage
    const verificationId = sessionStorage.getItem('firebaseVerificationId');

    if (!verificationId) {
        showAlert('انتهت صلاحية جلسة التحقق. يرجى طلب الرمز مرة أخرى.');
        // Reset forms
        if (isRegister) {
            const registerForm = document.getElementById('register-form');
            const registerCodeForm = document.getElementById('register-code-form');
            if (registerForm) registerForm.style.display = 'block';
            if (registerCodeForm) registerCodeForm.style.display = 'none';
        } else {
            const phoneForm = document.getElementById('phone-form');
            const codeForm = document.getElementById('code-form');
            if (phoneForm) phoneForm.style.display = 'block';
            if (codeForm) codeForm.style.display = 'none';
        }
        return;
    }
    
    console.log('Verifying code...');
    
    try {
        const credential = PhoneAuthProvider.credential(verificationId, code);
        const result = await signInWithCredential(auth, credential);
        const user = result.user;
        console.log('✓ Phone verification successful');
        
        if (isRegister) {
            const name = sessionStorage.getItem('tempName');
            if (!name) {
                showAlert('حدث خطأ: فقدان بيانات المستخدم. حاول مرة أخرى.');
                return;
            }
            console.log('Creating user profile...');
            await setDoc(doc(db, "users", user.uid), {
                name: name,
                phone: user.phoneNumber,
                paymentStatus: 'late',
                createdAt: serverTimestamp()
            });
            console.log('✓ User profile created');
        }
        
        // Clear temporary data after success
        sessionStorage.removeItem('firebaseVerificationId');
        sessionStorage.removeItem('tempName');
        
        showAlert('تم التحقق بنجاح!');
        console.log('✓ Authentication successful, redirecting...');
        // onAuthStateChanged will handle navigation
    } catch (error) {
        console.error("✗ Verification Error:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        
        let errorMsg = 'رمز التحقق غير صحيح.';
        
        if (error.code === 'auth/invalid-verification-code') {
            errorMsg = 'الرمز المدخل غير صحيح. تأكد من الرمز وحاول مرة أخرى.';
        } else if (error.code === 'auth/code-expired') {
            errorMsg = 'انتهت صلاحية الرمز. اطلب رمز جديد.';
        } else if (error.code === 'auth/invalid-credential') {
            errorMsg = 'بيانات التحقق غير صحيحة.';
        }
        
        showAlert(errorMsg);
    }
}

async function handleLogout() {
    if(unsubscribeChat) unsubscribeChat();
    if(unsubscribeMembers) unsubscribeMembers();
    if(unsubscribePayments) unsubscribePayments();
    await signOut(auth);
}

// --- Firestore Data Loading & Realtime Updates ---

function loadHomePageData() {
    if (!currentUser) return;
    
    const welcomeMsg = document.getElementById('welcome-message');
    if (welcomeMsg) {
        const h1 = welcomeMsg.querySelector('h1');
        if (h1) {
            h1.textContent = `أرحب يا ${currentUser.name || 'المستخدم'}`;
        }
    }
    
    try {
        loadHomePrayerAndDate();
        loadHomeMatches();
        loadHomeNews();
    } catch (error) {
        console.error('Error loading home page data:', error);
    }
}

function loadMembers() {
    const membersList = document.getElementById('members-list');
    if (!membersList) {
        console.warn('members-list element not found');
        return;
    }
    
    try {
        const membersCollection = collection(db, "users");
        unsubscribeMembers = onSnapshot(membersCollection, (snapshot) => {
            membersList.innerHTML = '';
            
            if (snapshot.empty) {
                membersList.innerHTML = '<p class="text-center">لا يوجد أعضاء بعد.</p>';
                return;
            }
            
            snapshot.forEach(doc => {
                const member = doc.data();
                const memberId = doc.id;
                const div = document.createElement('div');
                div.className = 'list-item-card';
                
                const statusIcon = member.paymentStatus === 'paid'
                    ? `<span class="font-bold" style="color: #5cb85c;">✅ دافع</span>` 
                    : `<span class="font-bold" style="color: #d9534f;">❌ متأخر</span>`;
                
                let adminControls = '';
                if (auth.currentUser?.uid === ADMIN_UID) {
                    adminControls = `
                        <button data-id="${memberId}" data-status="paid" class="toggle-payment-btn btn" style="width:auto; padding: 5px 8px; font-size: 12px; margin-inline-start: 10px;">دفع</button>
                        <button data-id="${memberId}" data-status="late" class="toggle-payment-btn btn btn-danger" style="width:auto; padding: 5px 8px; font-size: 12px;">لم يدفع</button>
                    `;
                }

                div.innerHTML = `
                    <div>
                        <p class="font-bold">${escapeHtml(member.name || 'بدون اسم')}</p>
                        <p class="text-sm">${escapeHtml(member.phone || 'بدون رقم')}</p>
                    </div>
                    <div class="flex items-center">
                        ${adminControls}
                        ${statusIcon}
                    </div>
                `;
                membersList.appendChild(div);
            });

            document.querySelectorAll('.toggle-payment-btn').forEach(button => {
                button.addEventListener('click', async (e) => {
                    const memberId = e.target.dataset.id;
                    const newStatus = e.target.dataset.status;
                    try {
                        await updateDoc(doc(db, "users", memberId), { paymentStatus: newStatus });
                        showAlert('تم تحديث الحالة بنجاح!');
                    } catch (error) {
                        console.error('Error updating payment status:', error);
                        showAlert('فشل تحديث الحالة. حاول مرة أخرى.');
                    }
                });
            });
        }, error => {
            console.error('Error loading members:', error);
            membersList.innerHTML = '<p class="text-center text-red-500">حدث خطأ في تحميل الأعضاء.</p>';
        });
    } catch (error) {
        console.error('Error setting up members listener:', error);
        membersList.innerHTML = '<p class="text-center text-red-500">حدث خطأ في تحميل الأعضاء.</p>';
    }
}

function loadPaymentLog() {
    const logList = document.getElementById('payment-log-list');
    if (!logList) {
        console.warn('payment-log-list element not found');
        return;
    }
    
    try {
        unsubscribePayments = onSnapshot(
            query(collection(db, "payments"), orderBy("date", "desc")), 
            (snapshot) => {
                logList.innerHTML = '';
                if (snapshot.empty) {
                    logList.innerHTML = '<p class="text-center">لا يوجد سجل للمدفوعات بعد.</p>';
                    return;
                }
                snapshot.docs.forEach(doc => {
                    const payment = doc.data();
                    const div = document.createElement('div');
                    div.className = 'list-item-card text-sm';
                    const date = payment.date 
                        ? new Date(payment.date.seconds * 1000).toLocaleDateString('ar-SA') 
                        : 'غير محدد';
                    div.innerHTML = `
                        <span class="font-bold">${payment.userName || 'بدون اسم'}</span>
                        <span style="color: #5cb85c;">✅ تم الدفع</span>
                        <span>${date}</span>
                    `;
                    logList.appendChild(div);
                });
            },
            error => {
                console.error('Error loading payment log:', error);
                logList.innerHTML = '<p class="text-center text-red-500">حدث خطأ في تحميل السجل.</p>';
            }
        );
    } catch (error) {
        console.error('Error setting up payment listener:', error);
        logList.innerHTML = '<p class="text-center text-red-500">حدث خطأ في تحميل السجل.</p>';
    }
}

function loadChat() {
    const chatBox = document.getElementById('chat-box');
    if (!chatBox) {
        console.warn('chat-box element not found');
        return;
    }
    
    try {
        unsubscribeChat = onSnapshot(
            query(collection(db, "chat"), orderBy("createdAt")), 
            (snapshot) => {
                chatBox.innerHTML = '';
                snapshot.forEach(doc => {
                    const msg = doc.data();
                    const div = document.createElement('div');
                    const isMe = msg.userId === auth.currentUser?.uid;
                    div.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'}`;
                    
                    const userDisplayName = msg.userName || 'مستخدم';
                    const messageText = escapeHtml(msg.text || '');
                    
                    div.innerHTML = `
                        <div class="text-xs mb-1 mx-2" style="color: var(--muted);">${escapeHtml(userDisplayName)}</div>
                        <div class="message ${isMe ? 'mine' : ''}">
                            <p>${messageText}</p>
                        </div>
                    `;
                    chatBox.appendChild(div);
                });
                chatBox.scrollTop = chatBox.scrollHeight;
            },
            error => {
                console.error('Error loading chat:', error);
                chatBox.innerHTML = '<p class="text-center text-red-500">حدث خطأ في تحميل الرسائل.</p>';
            }
        );
    } catch (error) {
        console.error('Error setting up chat listener:', error);
        chatBox.innerHTML = '<p class="text-center text-red-500">حدث خطأ في تحميل الرسائل.</p>';
    }
}

async function handleSendMessage(e) {
    e.preventDefault();
    
    const input = document.getElementById('chat-input');
    if (!input) {
        showAlert('عنصر الإدخال غير موجود.');
        return;
    }
    
    const text = input.value.trim();
    
    if (!text) {
        showAlert('الرجاء كتابة رسالة.');
        return;
    }
    
    if (!currentUser) {
        showAlert('يجب تسجيل الدخول أولاً.');
        return;
    }

    try {
        await addDoc(collection(db, "chat"), {
            text: text,
            userId: currentUser.uid,
            userName: currentUser.name || 'مستخدم',
            createdAt: serverTimestamp()
        });
        input.value = '';
    } catch (error) {
        console.error('Error sending message:', error);
        showAlert('فشل إرسال الرسالة: ' + (error.message || 'حاول مرة أخرى'));
    }
}

function loadProfileData() {
    if (!currentUser) return;
    
    const nameElement = document.getElementById('profile-name');
    const phoneElement = document.getElementById('profile-phone');
    
    if (nameElement) nameElement.textContent = currentUser.name || 'بدون اسم';
    if (phoneElement) phoneElement.textContent = currentUser.phone || 'بدون رقم';
}

// --- Service Functions ---
async function getPrayerData(latitude, longitude) {
    const now = new Date();
    const date = `${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()}`;
    const response = await fetch(`https://api.aladhan.com/v1/timings/${date}?latitude=${latitude}&longitude=${longitude}&method=4`);
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.json();
}

function prayerCards(timings, keys) {
    const labels = {
        Fajr: 'الفجر',
        Sunrise: 'الشروق',
        Dhuhr: 'الظهر',
        Asr: 'العصر',
        Maghrib: 'المغرب',
        Isha: 'العشاء'
    };

    return keys.map((key) => `
        <article class="stat">
            <span>${labels[key]}</span>
            <strong>${escapeHtml(timings[key] || '--:--')}</strong>
        </article>
    `).join('');
}

async function loadHomePrayerAndDate() {
    const hijriContainer = document.getElementById('hijri-date-container');
    const prayerContainer = document.getElementById('home-prayer-times');
    
    if (!hijriContainer || !prayerContainer) return;

    const todayGregorian = new Date();
    
    try {
        hijriContainer.innerHTML = `<p class="font-bold text-lg">${todayGregorian.toLocaleDateString('ar-SA-u-nu-latn', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>`;
        
        const response = await fetch(`https://api.aladhan.com/v1/gToH?date=${todayGregorian.getDate()}-${todayGregorian.getMonth()+1}-${todayGregorian.getFullYear()}`);
        if (response.ok) {
            const data = await response.json();
            if (data.data && data.data.hijri) {
                const hijri = data.data.hijri;
                hijriContainer.innerHTML += `<p class="text-md">${hijri.day} ${hijri.month.ar} ${hijri.year} هـ</p>`;
            }
        }
    } catch (error) {
        console.error("Could not fetch Hijri date:", error);
    }

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            try {
                const { latitude, longitude } = position.coords;
                const data = await getPrayerData(latitude, longitude);
                const timings = data.data.timings;
                
                prayerContainer.innerHTML = prayerCards(timings, ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']);
            } catch (error) {
                console.error('Error fetching prayer times:', error);
                prayerContainer.innerHTML = `<p class="text-red-400 text-center w-full">فشل في جلب البيانات.</p>`;
            }
        },
        () => {
            prayerContainer.innerHTML = `<p class="text-yellow-400 text-center w-full">يرجى السماح بالوصول للموقع.</p>`;
        }
    );
}

async function loadHomeMatches() {
    const container = document.getElementById('home-matches-list');
    if (!container) return;
    await loadMatches(container, 2);
}

async function loadHomeNews() {
    const container = document.getElementById('home-news-list');
    if (!container) return;
    await loadNews(container, 2);
}


async function loadPrayerTimes() {
    const container = document.getElementById('prayer-times-container');
    if (!container) return;
    
    container.innerHTML = `<p class="text-center w-full">يرجى السماح بالوصول إلى موقعك...</p>`;

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            try {
                const { latitude, longitude } = position.coords;
                const data = await getPrayerData(latitude, longitude);
                
                if (!data.data || !data.data.timings) {
                    throw new Error('Invalid prayer data structure');
                }
                
                const timings = data.data.timings;
                container.innerHTML = prayerCards(timings, ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']);
            } catch (error) {
                console.error('Error fetching prayer times:', error);
                container.innerHTML = `<p class="text-red-400 text-center w-full">فشل في جلب مواقيت الصلاة.</p>`;
            }
        },
        () => {
            container.innerHTML = `<p class="text-yellow-400 text-center w-full">تم رفض الوصول للموقع. لا يمكن عرض المواقيت.</p>`;
        }
    );
}

async function initQibla() {
    const container = document.getElementById('qibla-container');
    const status = document.getElementById('qibla-status');
    const compass = document.getElementById('compass');
    
    if (!container || !status || !compass) {
        console.warn('Qibla elements not found');
        return;
    }
    
    status.textContent = "يرجى السماح بالوصول إلى موقعك...";
    
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            try {
                const { latitude, longitude } = position.coords;
                const response = await fetch(`https://api.aladhan.com/v1/qibla/${latitude}/${longitude}`);
                
                if (!response.ok) {
                    throw new Error('Failed to fetch qibla direction');
                }
                
                const data = await response.json();
                
                if (!data.data || data.data.direction === undefined) {
                    throw new Error('Invalid qibla data structure');
                }
                
                const qiblaAngle = data.data.direction;

                status.textContent = "حرك جهازك لمعرفة اتجاه القبلة";
                compass.style.display = 'block';

                if (window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission === 'function') {
                    try {
                        const permission = await window.DeviceOrientationEvent.requestPermission();
                        if (permission === 'granted') {
                            window.addEventListener('deviceorientation', handleOrientation);
                        } else {
                            status.textContent = 'تم رفض إذن الوصول لحساسات الحركة.';
                        }
                    } catch (permError) {
                        console.error('Permission request error:', permError);
                        status.textContent = 'حدث خطأ في طلب الإذن.';
                    }
                } else if ('DeviceOrientationEvent' in window) {
                    window.addEventListener('deviceorientation', handleOrientation);
                } else {
                    status.textContent = 'جهازك لا يدعم تحديد الاتجاه.';
                }

                function handleOrientation(event) {
                    let direction = event.webkitCompassHeading || event.alpha;
                    if (direction === null) return;
                    compass.style.transform = `rotate(${-direction}deg)`;
                    const qiblaArrow = document.getElementById('qibla-arrow');
                    if (qiblaArrow) {
                        qiblaArrow.style.transform = `translateX(-50%) rotate(${qiblaAngle}deg)`;
                    }
                }
            } catch (error) {
                console.error('Error in initQibla:', error);
                status.textContent = 'فشل في حساب اتجاه القبلة.';
            }
        },
        () => {
            status.textContent = 'تم رفض الوصول للموقع. لا يمكن عرض القبلة.';
        }
    );
}

async function loadMatches(container, limit = 10) {
    if (!container) container = document.getElementById('matches-list');
    if (!container) return;
    
    container.innerHTML = `<p class="text-center">جاري تحميل المباريات...</p>`;
    
    const API_KEY = '14929df2f67189681a83746b9009038a';
    const SAUDI_LEAGUE_ID = '307';
    const season = new Date().getFullYear();
    const today = new Date().toISOString().slice(0, 10);

    const url = `https://v3.football.api-sports.io/fixtures?league=${SAUDI_LEAGUE_ID}&season=${season}&date=${today}`;
    const options = {
        method: 'GET',
        headers: {
            'x-apisports-key': API_KEY
        }
    };

    try {
        const response = await fetch(url, options);
        
        if (!response.ok) {
            throw new Error(`API returned status ${response.status}`);
        }
        
        const data = await response.json();

        if (data.errors && Object.keys(data.errors).length > 0) {
            const apiMessage = data.errors.plan || data.errors.requests || data.errors.season || 'تعذر جلب بيانات المباريات من مزود الخدمة.';
            container.innerHTML = `<p class="text-center">${escapeHtml(apiMessage)}</p>`;
            return;
        }
        
        if (!data.response || !Array.isArray(data.response)) {
            throw new Error('Invalid API response structure');
        }
        
        if (data.response.length === 0) {
            container.innerHTML = `<p class="text-center">لا توجد مباريات اليوم.</p>`;
            return;
        }

        container.innerHTML = '';
        data.response.slice(0, limit).forEach(fixture => {
            try {
                const homeTeam = fixture.teams?.home;
                const awayTeam = fixture.teams?.away;
                
                if (!homeTeam || !awayTeam) {
                    console.warn('Invalid team data in fixture');
                    return;
                }
                
                const score = fixture.fixture?.status?.short === 'FT' 
                    ? `${fixture.goals?.home || 0} - ${fixture.goals?.away || 0}` 
                    : new Date(fixture.fixture?.date).toLocaleTimeString('ar-SA', {hour: '2-digit', minute:'2-digit'});
                
                const homeLogo = safeExternalUrl(homeTeam.logo, 'assets/images/al-istiraha-icon.svg');
                const awayLogo = safeExternalUrl(awayTeam.logo, 'assets/images/al-istiraha-icon.svg');
                const statusShort = fixture.fixture?.status?.short;
                const statusClass = statusShort === 'FT' ? 'done' : statusShort === 'LIVE' ? 'live' : 'scheduled';
                const matchCard = `
                    <article class="match-card card">
                        <span class="badge ${statusClass}">${escapeHtml(fixture.fixture?.status?.long || 'قادمة')}</span>
                        <p class="muted">${escapeHtml(fixture.league?.name || 'دوري')}</p>
                        <div class="match-teams">
                            <span><img src="${homeLogo}" alt="" class="w-10 h-10 mb-1"> ${escapeHtml(homeTeam.name || 'فريق')}</span>
                            <span><img src="${awayLogo}" alt="" class="w-10 h-10 mb-1"> ${escapeHtml(awayTeam.name || 'فريق')}</span>
                        </div>
                        <div class="match-score">${escapeHtml(score)}</div>
                    </article>
                `;
                container.innerHTML += matchCard;
            } catch (itemError) {
                console.error('Error processing fixture:', itemError);
            }
        });

    } catch (error) {
        console.error("Error fetching matches:", error);
        container.innerHTML = `<p class="text-center">فشل في جلب المباريات. حاول مرة أخرى.</p>`;
    }
}

async function loadNews(container, limit = 10) {
    if (!container) container = document.getElementById('news-list');
    if (!container) return;
    
    container.innerHTML = `<p class="text-center">جاري تحميل الأخبار...</p>`;

    const API_KEY = 'fed169451378413e924ac29dca024540';
    const url = `https://newsapi.org/v2/top-headlines?country=sa&category=sports&language=ar&apiKey=${API_KEY}`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

    try {
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error(`Proxy returned status ${response.status}`);
        }
        
        const data = await response.json();

        if (!data || data.status !== 'ok') {
            throw new Error(data?.message || 'فشل في جلب الأخبار');
        }

        if (!Array.isArray(data.articles) || data.articles.length === 0) {
            container.innerHTML = `<p class="text-center">لا توجد أخبار حالياً.</p>`;
            return;
        }

        container.innerHTML = '';
        data.articles.slice(0, limit).forEach(article => {
            try {
                const title = article.title || 'بدون عنوان';
                const description = article.description || article.content || '';
                const url = safeExternalUrl(article.url, '#');
                const source = article.source?.name || 'مصدر';
                const image = safeExternalUrl(article.urlToImage, 'assets/images/al-istiraha-news-service.svg');
                
                const newsCard = `
                    <article class="news-card card">
                        <img src="${image}" alt="" loading="lazy">
                        <h3>${escapeHtml(title.substring(0, 100))}</h3>
                        <p class="muted">${escapeHtml(description.substring(0, 150))}</p>
                        <span class="text-xs opacity-70">${escapeHtml(source)}</span>
                        <a href="${url}" target="_blank" rel="noopener noreferrer" class="primary">قراءة المزيد</a>
                    </article>
                `;
                container.innerHTML += newsCard;
            } catch (itemError) {
                console.error('Error processing article:', itemError);
            }
        });

    } catch (error) {
        console.error("Error fetching news:", error);
        container.innerHTML = `<p class="text-center">فشل في جلب الأخبار. حاول مرة أخرى.</p>`;
    }
}


// --- App Initialization ---
function initApp() {
    console.log('Initializing app...');
    setOnlineState();
    
    try {
        loadTheme();
    } catch (error) {
        console.error('Error loading theme:', error);
    }

    onAuthStateChanged(auth, async (user) => {
        try {
            if (user) {
                console.log('✓ User authenticated:', user.uid);
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists()) {
                    currentUser = { uid: user.uid, ...userDoc.data() };
                    bottomNav.style.display = 'grid';
                    appLogo.style.display = 'block';
                    console.log('✓ User profile found, navigating to home');
                    await renderPage(window.location.hash || '#home');
                } else {
                    // New user, redirect to register
                    console.log('✓ New user, redirecting to register');
                    currentUser = null;
                    bottomNav.style.display = 'none';
                    appLogo.style.display = 'block';
                    await renderPage('#register');
                }
            } else {
                console.log('✓ No user authenticated, showing login');
                currentUser = null;
                bottomNav.style.display = 'none';
                appLogo.style.display = 'block';
                await renderPage(currentPublicRoute());
            }
        } catch (error) {
            console.error('✗ Error in auth state change:', error);
            currentUser = null;
            bottomNav.style.display = 'none';
            appLogo.style.display = 'block';
            await renderPage(currentPublicRoute());
        }
    });

        // Splash Screen Logic
    const splash = document.getElementById('splash');
    const mainContent = document.getElementById('main-content');

    const hasSeenSplash = sessionStorage.getItem('hasSeenSplash');

    if (hasSeenSplash) {
        if (splash) splash.style.display = 'none';
        if (mainContent) mainContent.style.display = 'grid';

        console.log('✓ Splash skipped');
    } else {
        sessionStorage.setItem('hasSeenSplash', 'true');

        setTimeout(() => {
            if (splash) {
                splash.style.opacity = '0';

                setTimeout(() => {
                    splash.style.display = 'none';

                    if (mainContent) {
                        mainContent.style.display = 'grid';
                        console.log('✓ Splash screen hidden, main content shown');
                    }
                }, 500);
            } else if (mainContent) {
                mainContent.style.display = 'grid';
            }
        }, 3000);
    }

    window.addEventListener('hashchange', () => {
        console.log('Page navigation:', window.location.hash);
        // Clean up recaptcha verifiers on page change
        recaptchaManager.destroyAll();
        renderPage(window.location.hash);
    });
    
    console.log('✓ App initialization complete');
}

// Start the app
initApp();
