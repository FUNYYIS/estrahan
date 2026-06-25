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
                applyPaymentSettingsView();
                loadPaymentOverview();
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
        if (typeof verifier.render === 'function' && !verifier.renderStarted) {
            verifier.renderStarted = true;
            verifier.render().catch((error) => {
                verifier.renderStarted = false;
                console.warn('reCAPTCHA pre-render failed:', error);
            });
        }
        return true;
    } else {
        console.error(`Failed to set up reCAPTCHA for ${containerId}`);
        showAlert('ما ضبط تجهيز التحقق، حدّث الصفحة وجرب.');
        return false;
    }
}

function setFormLoading(form, isLoading, loadingText) {
    if (!form) return;
    const submitButton = form.querySelector('button[type="submit"]');
    if (!submitButton) return;

    if (!submitButton.dataset.defaultText) {
        submitButton.dataset.defaultText = submitButton.textContent;
    }

    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? loadingText : submitButton.dataset.defaultText;
}

function setAuthStatus(isRegister, phase, message) {
    const id = isRegister
        ? phase === 'code' ? 'register-code-status' : 'register-status'
        : phase === 'code' ? 'login-code-status' : 'login-status';
    const element = document.getElementById(id);
    if (element) element.textContent = message || '';
}


async function handleCompleteRegistration(e) {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user) {
        showAlert('تحقق من رقم جوالك أولاً من صفحة الدخول.');
        await navigateToHash('#login');
        return;
    }

    const nameInput = document.getElementById('register-name');
    const inviteInput = document.getElementById('register-invite-code');

    const name = nameInput?.value.trim();
    const inviteCode = inviteInput?.value.trim();

    if (!name) {
        showAlert('اكتب اسمك يا طويل العمر.');
        return;
    }

    if (!inviteCode) {
        showAlert('اكتب رمز الدعوة.');
        return;
    }

    try {
        const completeRegistration = httpsCallable(functions, 'completeRegistration');
        const response = await completeRegistration({
            name,
            inviteCode
        });
        const registeredUser = response.data?.user || {};

        currentUser = {
            uid: user.uid,
            name: registeredUser.name || name,
            phone: registeredUser.phone || user.phoneNumber || '',
            paymentStatus: registeredUser.paymentStatus || 'late',
            disabled: registeredUser.disabled === true,
            avatarUrl: registeredUser.avatarUrl || ''
        };

        document.body.classList.add('is-authenticated');
        syncShellUserState();
        showAlert('تم تسجيلك بنجاح، حيّاك الله.');
        await navigateToHash('#home');
    } catch (error) {
        console.error('Registration completion failed:', error);
        showAlert(getRegistrationErrorMessage(error));
    }
}

function getRegistrationErrorMessage(error) {
    const code = error?.code || '';
    const message = error?.message || '';

    if (code.includes('permission-denied')) {
        return 'رمز الدعوة غير صحيح.';
    }

    if (code.includes('invalid-argument')) {
        return 'تأكد من الاسم ورمز الدعوة.';
    }

    if (code.includes('already-exists')) {
        return 'هذا الحساب مسجل مسبقاً.';
    }

    if (code.includes('unauthenticated')) {
        return 'تحقق من رقم جوالك أولاً.';
    }

    if (code.includes('unavailable') || code.includes('deadline-exceeded')) {
        return 'تعذر الاتصال بخدمة التسجيل. حاول مرة ثانية.';
    }

    if (code.includes('failed-precondition')) {
        return 'التسجيل غير متاح حالياً. تواصل مع مسؤول الاستراحة.';
    }

    return message && !message.includes('internal')
        ? 'فشل التسجيل. تأكد من البيانات وحاول مرة ثانية.'
        : 'فشل التسجيل. حاول مرة ثانية.';
}


async function handleSendCode(e, isRegister = false) {
    e.preventDefault();
    console.log(`handleSendCode called (isRegister=${isRegister})`);

    const phoneInputId = isRegister ? 'register-phone-number' : 'phone-number';
    const phoneInput = document.getElementById(phoneInputId);

    if (!phoneInput) {
        showAlert('خانة الجوال مو موجودة، حدّث الصفحة.');
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

    // Get recaptcha verifier
    const appVerifier = window.recaptchaVerifier;
    if (!appVerifier) {
        console.error('reCAPTCHA verifier not initialized');
        showAlert('يتم تحضير التحقق... حاول مرة أخرى بعد قليل.');
        return;
    }

    console.log(`Sending verification code to: ${phoneNumber}`);
    setFormLoading(e.currentTarget, true, 'جاري إرسال الرمز...');
    setAuthStatus(isRegister, 'phone', 'نجهز التحقق ونرسل لك الرمز...');

    try {
        const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
        console.log('✓ Verification code sent successfully');

        // Store verification ID in sessionStorage
        sessionStorage.setItem('firebaseVerificationId', confirmationResult.verificationId);
        setAuthStatus(isRegister, 'code', 'وصل الرمز. دخّله هنا وكمل.');
        if (isRegister) {
            await navigateToHash('#register');
        } else {
            const phoneForm = document.getElementById('phone-form');
            const codeForm = document.getElementById('code-form');
            if (phoneForm) phoneForm.style.display = 'none';
            if (codeForm) codeForm.style.display = 'block';
        }
        setFormLoading(e.currentTarget, false);
    } catch (error) {
        console.error("✗ SMS Error:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);

        let errorMsg = 'ما قدرنا نرسل الرمز. تأكد من الرقم.';

        if (error.code === 'auth/invalid-phone-number') {
            errorMsg = 'صيغة الرقم ما هي صحيحة. استخدم +966XXXXXXXXX';
        } else if (error.code === 'auth/too-many-requests') {
            errorMsg = 'كثرت الطلبات شوي. جرّب بعدين.';
        } else if (error.code === 'auth/unauthorized-domain') {
            errorMsg = 'نطاق المعاينة غير مصرح في Firebase. أضف 127.0.0.1 أو الدومين من إعدادات Firebase Authentication.';
        } else if (error.code === 'auth/invalid-app-credential') {
            errorMsg = 'في مشكلة بالتحقق. تأكد من إعدادات النطاق.';
        } else if (error.code === 'auth/captcha-check-failed') {
            errorMsg = 'ما ضبط تحقق reCAPTCHA. جرّب مرة ثانية.';
        }

        showAlert(errorMsg);
        setAuthStatus(isRegister, 'phone', '');

        // Reset recaptcha and try to recreate it
        const containerId = isRegister ? 'recaptcha-container-register' : 'recaptcha-container';
        recaptchaManager.destroy(containerId);

        // Wait a moment then recreate
        setTimeout(() => {
            const success = setupRecaptcha(containerId);
            if (!success) {
                showAlert('ما ضبطت إعادة التحقق. حدّث الصفحة وجرب.');
            }
        }, 500);
        setFormLoading(e.currentTarget, false);
    }
}

async function handleVerifyCode(e, isRegister = false) {
    e.preventDefault();
    console.log(`handleVerifyCode called (isRegister=${isRegister})`);

    const codeInputId = isRegister ? 'register-verification-code' : 'verification-code';
    const codeInput = document.getElementById(codeInputId);

    if (!codeInput) {
        showAlert('خانة الرمز مو موجودة، حدّث الصفحة.');
        return;
    }

    const code = codeInput.value.trim();

    if (!code) {
        showAlert('اكتب رمز الدخول يا ذيب.');
        return;
    }

    // Get verification ID from sessionStorage
    const verificationId = sessionStorage.getItem('firebaseVerificationId');

    if (!verificationId) {
        showAlert('انتهت مهلة الرمز. اطلب رمز جديد.');
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
    setFormLoading(e.currentTarget, true, 'جاري التحقق...');
    setAuthStatus(isRegister, 'code', 'نتأكد من الرمز...');

    try {
        const credential = PhoneAuthProvider.credential(verificationId, code);
        const result = await signInWithCredential(auth, credential);
        const user = result.user;
        console.log('✓ Phone verification successful');

        if (isRegister) {
            sessionStorage.removeItem('firebaseVerificationId');

            showAlert('تم التحقق من رقمك. كمل الاسم ورمز الدعوة.');
            await navigateToHash('#register');
            return;
        }

        if (!isRegister) {
            const userDocRef = doc(db, "users", user.uid);
            const existingUserDoc = await getDoc(userDocRef);
            if (!existingUserDoc.exists()) {
                showAlert('رقمك غير مسجل. كمل التسجيل باسمك ورمز الدعوة.');
                await navigateToHash('#register');
                return;
            }
        }

        // Clear temporary data after success
        sessionStorage.removeItem('firebaseVerificationId');

        setAuthStatus(isRegister, 'code', 'تم التحقق. تفضل اقلط...');
        console.log('✓ Authentication successful, redirecting...');
        // onAuthStateChanged will handle navigation
    } catch (error) {
        console.error("✗ Verification Error:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);

        let errorMsg = 'رمز الدخول غير صحيح.';

        if (error.code === 'auth/invalid-verification-code') {
            errorMsg = 'الرمز اللي دخلته غير صحيح. تأكد وجرب.';
        } else if (error.code === 'auth/code-expired') {
            errorMsg = 'انتهت صلاحية الرمز. اطلب رمز جديد.';
        } else if (error.code === 'auth/invalid-credential') {
            errorMsg = 'بيانات التحقق ما هي صحيحة.';
        }

        showAlert(errorMsg);
        setAuthStatus(isRegister, 'code', '');
        setFormLoading(e.currentTarget, false);
    }
}

async function handleLogout() {
    if(unsubscribeChat) unsubscribeChat();
    if(unsubscribeMembers) unsubscribeMembers();
    if(unsubscribePayments) unsubscribePayments();
    await signOut(auth);
}

// --- Firestore Data Loading & Realtime Updates ---
