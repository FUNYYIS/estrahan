// استيراد الوظائف اللازمة من حزم Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    RecaptchaVerifier,
    signInWithPhoneNumber,
    signOut, 
    onAuthStateChanged
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
const ADMIN_UID = "YOUR_ADMIN_UID_HERE"; //  <-- هام: ضع هنا الـ UID الخاص بحساب الأدمن

// --- عناصر واجهة المستخدم ---
const pageContent = document.getElementById('page-content');
const bottomNav = document.getElementById('bottom-nav');
const customAlert = document.getElementById('custom-alert');
const alertMessage = document.getElementById('alert-message');
const alertCloseBtn = document.getElementById('alert-close-btn');
const appLogo = document.getElementById('app-logo');

// --- حالة التطبيق ---
let currentUser = null; 
let confirmationResult = null;
let tempName = ''; // لتخزين الاسم مؤقتاً عند التسجيل
let unsubscribeChat, unsubscribeMembers, unsubscribePayments;

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
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(savedTheme);
}

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

function updateActiveNav(hash) {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === hash) {
            link.classList.add('active');
        }
    });
}

async function renderPage(hash) {
    const defaultPage = currentUser ? '#home' : '#login';
    const currentHash = hash || defaultPage;
    const pageFile = routes[currentHash];
    
    if (pageFile) {
        try {
            const response = await fetch(`pages/${pageFile}`);
            if (!response.ok) throw new Error('Page not found');
            const pageHtml = await response.text();
            pageContent.innerHTML = pageHtml;
            
            const safeCreateIcons = () => {
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                } else {
                    setTimeout(safeCreateIcons, 100);
                }
            };
            safeCreateIcons();

            attachEventListeners(currentHash);
            loadPageData(currentHash);
            updateActiveNav(currentHash);
        } catch (error) {
            console.error('Error fetching page:', error);
            pageContent.innerHTML = '<p class="text-center">عفواً، الصفحة غير موجودة.</p>';
        }
    } else {
         await renderPage(defaultPage); // Fallback to default
    }
}

function attachEventListeners(hash) {
    const pageId = hash.substring(1); // remove '#'
    if (pageId === 'login') {
        document.getElementById('phone-form')?.addEventListener('submit', (e) => handleSendCode(e, false));
        document.getElementById('code-form')?.addEventListener('submit', (e) => handleVerifyCode(e, false));
        setupRecaptcha('recaptcha-container');
    }
    if (pageId === 'register') {
        document.getElementById('register-form')?.addEventListener('submit', (e) => handleSendCode(e, true));
        document.getElementById('register-code-form')?.addEventListener('submit', (e) => handleVerifyCode(e, true));
        setupRecaptcha('recaptcha-container-register');
    }
    if (pageId === 'settings') {
        document.getElementById('logout-button')?.addEventListener('click', handleLogout);
        const themeToggle = document.getElementById('theme-toggle');
        if(themeToggle) {
            themeToggle.checked = (localStorage.getItem('theme') === 'dark');
            themeToggle.addEventListener('change', toggleTheme);
        }
    }
    if (pageId === 'chat') {
        document.getElementById('chat-form')?.addEventListener('submit', handleSendMessage);
    }
}

function loadPageData(pageId) {
    if (!currentUser && !['login-page', 'register-page'].includes(pageId)) return;
    
    switch (pageId) {
        case 'home-page':
            loadHomePageData();
            break;
        case 'members-page':
            loadMembers();
            break;
        case 'payments-page':
            loadPaymentLog();
            break;
        case 'chat-page':
            loadChat();
            break;
        case 'profile-settings-page':
            loadProfileData();
            break;
        case 'prayer-page':
            loadPrayerTimes();
            break;
        case 'qibla-page':
            initQibla();
            break;
        case 'matches-page':
            loadMatches();
            break;
        case 'news-page':
            loadNews();
            break;
    }
}

// --- Firebase Auth Handlers ---
function setupRecaptcha(containerId) {
    try {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
            'size': 'invisible',
            'callback': (response) => {
                // reCAPTCHA solved, allow signInWithPhoneNumber.
            }
        });
    } catch (error) {
        console.error("Recaptcha Error:", error);
        showAlert("حدث خطأ في إعداد reCAPTCHA. يرجى تحديث الصفحة.");
    }
}

async function handleSendCode(e, isRegister = false) {
    e.preventDefault();
    let phoneNumber = isRegister ? document.getElementById('register-phone-number').value : document.getElementById('phone-number').value;
    
    // تحويل الرقم إلى الصيغة الدولية
    if (phoneNumber.startsWith('05')) {
        phoneNumber = '+966' + phoneNumber.substring(1);
    }

    if(isRegister) {
        tempName = document.getElementById('register-name').value;
        if(!tempName) {
            showAlert('الرجاء إدخال الاسم الكامل.');
            return;
        }
    }

    const appVerifier = window.recaptchaVerifier;

    try {
        confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
        showAlert('تم إرسال رمز التحقق إلى جوالك.');
        if(isRegister) {
            document.getElementById('register-form').style.display = 'none';
            document.getElementById('register-code-form').style.display = 'block';
        } else {
            document.getElementById('phone-form').style.display = 'none';
            document.getElementById('code-form').style.display = 'block';
        }
    } catch (error) {
        console.error("SMS Error:", error);
        showAlert('فشل إرسال الرمز. تأكد من صحة الرقم.');
        try {
            window.recaptchaVerifier.render().then(widgetId => {
                grecaptcha.reset(widgetId);
            });
        } catch(e) { console.error("Recaptcha reset failed", e); }
    }
}

async function handleVerifyCode(e, isRegister = false) {
    e.preventDefault();
    const code = isRegister ? document.getElementById('register-verification-code').value : document.getElementById('verification-code').value;
    if (!confirmationResult) {
        showAlert('حدث خطأ، يرجى طلب الرمز مرة أخرى.');
        return;
    }
    try {
        const result = await confirmationResult.confirm(code);
        const user = result.user;
        if (isRegister) {
             await setDoc(doc(db, "users", user.uid), {
                name: tempName,
                phone: user.phoneNumber,
                paymentStatus: 'late',
                createdAt: serverTimestamp()
            });
        }
        // onAuthStateChanged will handle navigation
    } catch (error) {
        console.error("Verification Error:", error);
        showAlert('رمز التحقق غير صحيح.');
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
    if(welcomeMsg) welcomeMsg.querySelector('h1').textContent = `أرحب يا ${currentUser.name}`;
    
    loadHomePrayerAndDate();
    loadHomeMatches();
    loadHomeNews();
}

function loadMembers() {
    const membersList = document.getElementById('members-list');
    if (!membersList) return;
    const membersCollection = collection(db, "users");
    unsubscribeMembers = onSnapshot(membersCollection, (snapshot) => {
        membersList.innerHTML = '';
        snapshot.forEach(doc => {
            const member = doc.data();
            const memberId = doc.id;
            const div = document.createElement('div');
            div.className = 'list-item-card';
            const statusIcon = member.paymentStatus === 'paid' ? `<span class="font-bold" style="color: #5cb85c;">✅ دافع</span>` : `<span class="font-bold" style="color: #d9534f;">❌ متأخر</span>`;
            
            let adminControls = '';
            if (auth.currentUser?.uid === ADMIN_UID) {
                adminControls = `
                    <button data-id="${memberId}" data-status="paid" class="toggle-payment-btn btn" style="width:auto; padding: 5px 8px; font-size: 12px; margin-inline-start: 10px;">دفع</button>
                    <button data-id="${memberId}" data-status="late" class="toggle-payment-btn btn btn-danger" style="width:auto; padding: 5px 8px; font-size: 12px;">لم يدفع</button>
                `;
            }

            div.innerHTML = `
                <div>
                    <p class="font-bold">${member.name}</p>
                    <p class="text-sm">${member.phone || ''}</p>
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
                await updateDoc(doc(db, "users", memberId), { paymentStatus: newStatus });
                showAlert('تم تحديث الحالة بنجاح!');
            });
        });
    });
}

function loadPaymentLog() {
    const logList = document.getElementById('payment-log-list');
    if (!logList) return;
    unsubscribePayments = onSnapshot(query(collection(db, "payments"), orderBy("date", "desc")), (snapshot) => {
        logList.innerHTML = '';
         if (snapshot.empty) {
            logList.innerHTML = '<p class="text-center">لا يوجد سجل للمدفوعات بعد.</p>';
            return;
        }
        snapshot.docs.forEach(doc => {
            const payment = doc.data();
            const div = document.createElement('div');
            div.className = 'list-item-card text-sm';
            const date = payment.date ? new Date(payment.date.seconds * 1000).toLocaleDateString('ar-SA') : 'غير محدد';
            div.innerHTML = `
                <span class="font-bold">${payment.userName}</span>
                <span style="color: #5cb85c;">✅ تم الدفع</span>
                <span>${date}</span>
            `;
            logList.appendChild(div);
        });
    });
}

function loadChat() {
    const chatBox = document.getElementById('chat-box');
    if (!chatBox) return;
    unsubscribeChat = onSnapshot(query(collection(db, "chat"), orderBy("createdAt")), (snapshot) => {
        chatBox.innerHTML = '';
        snapshot.forEach(doc => {
            const msg = doc.data();
            const div = document.createElement('div');
            const isMe = msg.userId === auth.currentUser?.uid;
            div.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'}`;
            div.innerHTML = `
                <div class="text-xs mb-1 mx-2" style="color: var(--text-color); opacity: 0.7;">${msg.userName}</div>
                <div class="max-w-xs p-3 rounded-xl ${isMe ? 'bg-[#c76b29] text-white rounded-br-none' : 'bg-gray-200 text-black rounded-bl-none'}" style="${isMe ? 'background-color: var(--primary-accent);' : 'background-color: var(--card-bg);'}">
                    <p>${msg.text}</p>
                </div>
            `;
            chatBox.appendChild(div);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });
}

async function handleSendMessage(e) {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (text === '' || !currentUser) return;

    try {
        await addDoc(collection(db, "chat"), {
            text: text,
            userId: currentUser.uid,
            userName: currentUser.name,
            createdAt: serverTimestamp()
        });
        input.value = '';
    } catch (error) {
        showAlert('لم يتم إرسال الرسالة: ' + error.message);
    }
}

function loadProfileData() {
    if (!currentUser) return;
    document.getElementById('profile-name').textContent = currentUser.name;
    document.getElementById('profile-phone').textContent = currentUser.phone;
}

// --- Service Functions ---
async function getPrayerData(latitude, longitude) {
    const date = new Date().toISOString().split('T')[0];
    const response = await fetch(`https://api.aladhan.com/v1/timings/${date}?latitude=${latitude}&longitude=${longitude}&method=4`);
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.json();
}

async function loadHomePrayerAndDate() {
    const hijriContainer = document.getElementById('hijri-date-container');
    const prayerContainer = document.getElementById('home-prayer-times');
    if (!hijriContainer || !prayerContainer) return;

    const todayGregorian = new Date();
    hijriContainer.innerHTML = `<p class="font-bold text-lg">${todayGregorian.toLocaleDateString('ar-SA-u-nu-latn', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>`;
    
    try {
        const response = await fetch(`https://api.aladhan.com/v1/gToH?date=${todayGregorian.getDate()}-${todayGregorian.getMonth()+1}-${todayGregorian.getFullYear()}`);
        const data = await response.json();
        const hijri = data.data.hijri;
        hijriContainer.innerHTML += `<p class="text-md">${hijri.day} ${hijri.month.ar} ${hijri.year} هـ</p>`;
    } catch(e) {
        console.error("Could not fetch Hijri date");
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
        try {
            const { latitude, longitude } = position.coords;
            const data = await getPrayerData(latitude, longitude);
            const timings = data.data.timings;
            
            prayerContainer.innerHTML = `
                <div class="flex justify-between items-center w-full text-sm"><span>الفجر</span><span class="font-bold">${timings.Fajr}</span></div>
                <div class="flex justify-between items-center w-full text-sm"><span>الظهر</span><span class="font-bold">${timings.Dhuhr}</span></div>
                <div class="flex justify-between items-center w-full text-sm"><span>العصر</span><span class="font-bold">${timings.Asr}</span></div>
                <div class="flex justify-between items-center w-full text-sm"><span>المغرب</span><span class="font-bold">${timings.Maghrib}</span></div>
                <div class="flex justify-between items-center w-full text-sm"><span>العشاء</span><span class="font-bold">${timings.Isha}</span></div>
            `;
        } catch (error) {
            prayerContainer.innerHTML = `<p class="text-red-400 text-center w-full">فشل في جلب البيانات.</p>`;
        }
    }, () => {
        prayerContainer.innerHTML = `<p class="text-yellow-400 text-center w-full">يرجى السماح بالوصول للموقع.</p>`;
    });
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

    navigator.geolocation.getCurrentPosition(async (position) => {
        try {
            const { latitude, longitude } = position.coords;
            const data = await getPrayerData(latitude, longitude);
            const timings = data.data.timings;
            container.innerHTML = `
                <div class="flex justify-between items-center w-full"><span>الفجر</span><span class="font-bold">${timings.Fajr}</span></div>
                <div class="flex justify-between items-center w-full"><span>الشروق</span><span class="font-bold">${timings.Sunrise}</span></div>
                <div class="flex justify-between items-center w-full"><span>الظهر</span><span class="font-bold">${timings.Dhuhr}</span></div>
                <div class="flex justify-between items-center w-full"><span>العصر</span><span class="font-bold">${timings.Asr}</span></div>
                <div class="flex justify-between items-center w-full"><span>المغرب</span><span class="font-bold">${timings.Maghrib}</span></div>
                <div class="flex justify-between items-center w-full"><span>العشاء</span><span class="font-bold">${timings.Isha}</span></div>
            `;
        } catch (error) {
            container.innerHTML = `<p class="text-red-400 text-center w-full">فشل في جلب مواقيت الصلاة.</p>`;
        }
    }, () => {
        container.innerHTML = `<p class="text-yellow-400 text-center w-full">تم رفض الوصول للموقع. لا يمكن عرض المواقيت.</p>`;
    });
}

async function initQibla() {
    const container = document.getElementById('qibla-container');
    if (!container) return;
    const status = document.getElementById('qibla-status');
    const compass = document.getElementById('compass');
    
    status.textContent = "يرجى السماح بالوصول إلى موقعك...";
    navigator.geolocation.getCurrentPosition(async (position) => {
        try {
            const { latitude, longitude } = position.coords;
            const response = await fetch(`https://api.aladhan.com/v1/qibla/${latitude}/${longitude}`);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            const qiblaAngle = data.data.direction;

            status.textContent = "حرك جهازك لمعرفة اتجاه القبلة";
            compass.style.display = 'block';

            if (window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission === 'function') {
                const permission = await window.DeviceOrientationEvent.requestPermission();
                if (permission === 'granted') {
                    window.addEventListener('deviceorientation', handleOrientation);
                } else {
                    status.textContent = 'تم رفض إذن الوصول لحساسات الحركة.';
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
                document.getElementById('qibla-arrow').style.transform = `translateX(-50%) rotate(${qiblaAngle}deg)`;
            }
        } catch (error) {
             status.textContent = 'فشل في حساب اتجاه القبلة.';
        }
    }, () => {
        status.textContent = 'تم رفض الوصول للموقع. لا يمكن عرض القبلة.';
    });
}

async function loadMatches(container, limit = 10) {
    if (!container) container = document.getElementById('matches-list');
    if (!container) return;
    container.innerHTML = `<p class="text-center">جاري تحميل المباريات...</p>`;
    
    const API_KEY = '48988b2765msh20399a4a297b4f2p13ddc8jsn272009bee0d7';
    const SAUDI_LEAGUE_ID = '307';
    const season = new Date().getFullYear();
    const today = new Date().toISOString().slice(0, 10);

    const url = `https://api-football-v1.p.rapidapi.com/v3/fixtures?league=${SAUDI_LEAGUE_ID}&season=${season}&date=${today}`;
    const options = {
        method: 'GET',
        headers: {
            'x-rapidapi-key': API_KEY,
            'x-rapidapi-host': 'api-football-v1.p.rapidapi.com'
        }
    };

    try {
        const response = await fetch(url, options);
        const data = await response.json();
        
        if (data.response.length === 0) {
            container.innerHTML = `<p class="text-center">لا توجد مباريات اليوم.</p>`;
            return;
        }

        container.innerHTML = '';
        data.response.slice(0, limit).forEach(fixture => {
            const homeTeam = fixture.teams.home;
            const awayTeam = fixture.teams.away;
            const score = fixture.fixture.status.short === 'FT' ? `${fixture.goals.home} - ${fixture.goals.away}` : new Date(fixture.fixture.date).toLocaleTimeString('ar-SA', {hour: '2-digit', minute:'2-digit'});
            
            const matchCard = `
                <div class="list-item-card flex-col items-center p-4 space-y-2">
                    <span class="text-xs opacity-70">${fixture.league.name}</span>
                    <div class="flex justify-between items-center w-full">
                        <div class="flex flex-col items-center w-1/3">
                            <img src="${homeTeam.logo}" alt="${homeTeam.name}" class="w-10 h-10 mb-1">
                            <span class="font-bold text-center text-sm">${homeTeam.name}</span>
                        </div>
                        <span class="font-bold text-2xl" style="color: var(--primary-accent);">${score}</span>
                        <div class="flex flex-col items-center w-1/3">
                            <img src="${awayTeam.logo}" alt="${awayTeam.name}" class="w-10 h-10 mb-1">
                            <span class="font-bold text-center text-sm">${awayTeam.name}</span>
                        </div>
                    </div>
                    <span class="text-xs opacity-70">${fixture.fixture.status.long}</span>
                </div>
            `;
            container.innerHTML += matchCard;
        });

    } catch (error) {
        console.error("Error fetching matches:", error);
        container.innerHTML = `<p class="text-center">فشل في جلب المباريات. تأكد من صحة مفتاح API والاتصال بالإنترنت.</p>`;
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
        const data = await response.json();

        if (data.status !== 'ok') {
            throw new Error(data.message || 'فشل في جلب الأخبار');
        }

        if (data.articles.length === 0) {
            container.innerHTML = `<p class="text-center">لا توجد أخبار حالياً.</p>`;
            return;
        }

        container.innerHTML = '';
        data.articles.slice(0, limit).forEach(article => { 
            const newsCard = `
                <a href="${article.url}" target="_blank" rel="noopener noreferrer" class="list-item-card flex-col items-start p-4 text-right no-underline" style="text-decoration: none;">
                    <h3 class="font-bold mb-2">${article.title}</h3>
                    <p class="text-sm opacity-75">${article.description || ''}</p>
                    <span class="text-xs opacity-50 mt-2">${article.source.name}</span>
                </a>
            `;
            container.innerHTML += newsCard;
        });

    } catch (error) {
        console.error("Error fetching news:", error);
        container.innerHTML = `<p class="text-center">فشل في جلب الأخبار. قد يكون مفتاح الـ API غير صالح أو انتهت صلاحيته.</p>`;
    }
}


// --- App Initialization ---
function initApp() {
    loadTheme();

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                currentUser = { uid: user.uid, ...userDoc.data() };
                bottomNav.style.display = 'flex';
                appLogo.style.display = 'block';
                await renderPage(window.location.hash || '#home');
            } else {
                await renderPage('#register');
            }
        } else {
            currentUser = null;
            bottomNav.style.display = 'none';
            appLogo.style.display = 'block'; // Show logo on login/register pages
            await renderPage('#login');
        }
    });

    // Splash Screen Logic
    const splash = document.getElementById('splash');
    const mainContent = document.getElementById('main-content');
    setTimeout(() => {
        if(splash) {
            splash.style.opacity = '0';
            setTimeout(() => {
                splash.style.display = 'none';
                mainContent.style.display = 'block';
            }, 500);
        } else {
             mainContent.style.display = 'block';
        }
    }, 3000); // Set to 3 seconds

    window.addEventListener('hashchange', () => renderPage(window.location.hash));
}

// Start the app
initApp();
