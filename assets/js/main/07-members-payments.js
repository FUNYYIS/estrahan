function setupManualMemberForm() {
    const form = document.getElementById('manual-member-form');
    if (!form) return;

    const nameInput = document.getElementById('manual-member-name');
    const phoneInput = document.getElementById('manual-member-phone');
    const status = document.getElementById('manual-member-status');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (auth.currentUser?.uid !== ADMIN_UID && currentUser?.uid !== ADMIN_UID) {
            showAlert('هذه العملية للمسؤول فقط.');
            return;
        }

        const name = nameInput?.value.trim();
        const phone = phoneInput?.value.trim() || '';

        if (!name) {
            showAlert('اكتب اسم العضو أولاً.');
            return;
        }

        if (status) status.textContent = 'جاري إضافة العضو...';

        try {
            const addManualMember = httpsCallable(functions, 'addManualMember');
            await addManualMember({
                name,
                phone
            });

            form.reset();
            if (status) status.textContent = 'تمت إضافة العضو.';
            showAlert('تمت إضافة العضو.');
        } catch (error) {
            console.error('Manual member add failed:', error);
            if (status) status.textContent = 'فشلت إضافة العضو.';
            showAlert('فشلت إضافة العضو.');
        }
    });
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
            const isAdminUser = auth.currentUser?.uid === ADMIN_UID || currentUser?.uid === ADMIN_UID;
            membersList.innerHTML = '';

            if (snapshot.empty) {
                membersList.innerHTML = '<p class="text-center">ما فيه مطانيخ للحين.</p>';
                return;
            }

            snapshot.forEach(doc => {
                const member = doc.data();
                const memberId = doc.id;
                const div = document.createElement('div');
                div.className = 'list-item-card';

                const statusIcon = member.paymentStatus === 'paid'
                    ? `<span class="font-bold payment-status-paid">✅ مدفوع</span>`
                    : `<span class="font-bold payment-status-late">❌ متأخر</span>`;

                let adminControls = '';
                if (isAdminUser) {
                    adminControls = `
                        <button data-id="${memberId}" data-status="paid" class="toggle-payment-btn btn btn-compact ms-2">دفع</button>
                        <button data-id="${memberId}" data-status="late" class="toggle-payment-btn btn btn-danger btn-compact">لم يدفع</button>
                        <button data-id="${memberId}" data-name="${escapeHtml(member.name || '')}" class="edit-member-btn btn btn-compact">تعديل الاسم</button>
                        <button data-id="${memberId}" data-disabled="${member.disabled === true ? 'true' : 'false'}" class="disable-member-btn btn btn-compact">${member.disabled === true ? 'تفعيل' : 'تعطيل'}</button>
                        <button data-id="${memberId}" class="reset-avatar-btn btn btn-compact">تصفير الصورة</button>
                        <button data-id="${memberId}" class="delete-member-btn btn btn-danger btn-compact">حذف</button>
                    `;
                }

                const phoneLine = isAdminUser
                    ? `<p class="text-sm">${escapeHtml(member.phone || 'بدون رقم')}</p>`
                    : '';

                div.innerHTML = `
                    <div>
                        <p class="font-bold">${escapeHtml(member.name || 'بدون اسم')}</p>
                        ${phoneLine}
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
                    const memberId = e.currentTarget.dataset.id;
                    const newStatus = e.currentTarget.dataset.status;
                    try {
                        const updateMemberPaymentStatus = httpsCallable(functions, 'updateMemberPaymentStatus');
                        await updateMemberPaymentStatus({ memberId, paymentStatus: newStatus });
                        showAlert('تم تحديث الحالة بنجاح!');
                    } catch (error) {
                        console.error('Error updating payment status:', error);
                        showAlert('فشل تحديث الحالة. حاول مرة أخرى.');
                    }
                });
            });

            document.querySelectorAll('.edit-member-btn').forEach(button => {
                button.addEventListener('click', async (e) => {
                    const memberId = e.currentTarget.dataset.id;
                    const oldName = e.currentTarget.dataset.name || '';
                    const newName = prompt('اكتب الاسم الجديد:', oldName);
                    if (!newName || !newName.trim()) return;

                    try {
                        const updateMemberName = httpsCallable(functions, 'updateMemberName');
                        await updateMemberName({ memberId, name: newName.trim() });
                        showAlert('تم تعديل اسم العضو بنجاح.');
                    } catch (error) {
                        console.error('Error updating member name:', error);
                        showAlert('فشل تعديل اسم العضو.');
                    }
                });
            });


            document.querySelectorAll('.disable-member-btn').forEach(button => {
                button.addEventListener('click', async (e) => {
                    const memberId = e.currentTarget.dataset.id;
                    const isDisabled = e.currentTarget.dataset.disabled === 'true';

                    try {
                        const setMemberDisabled = httpsCallable(functions, 'setMemberDisabled');
                        await setMemberDisabled({ memberId, disabled: !isDisabled });
                        showAlert(isDisabled ? 'تم تفعيل العضو.' : 'تم تعطيل العضو.');
                    } catch (error) {
                        console.error('Error toggling member disabled:', error);
                        showAlert('فشل تحديث حالة العضو.');
                    }
                });
            });

            document.querySelectorAll('.reset-avatar-btn').forEach(button => {
                button.addEventListener('click', async (e) => {
                    const memberId = e.currentTarget.dataset.id;
                    const confirmed = confirm('متأكد تبي تصفر صورة هذا العضو؟');
                    if (!confirmed) return;

                    try {
                        const resetMemberAvatar = httpsCallable(functions, 'resetMemberAvatar');
                        await resetMemberAvatar({ memberId });
                        showAlert('تمت إعادة تعيين صورة العضو.');
                    } catch (error) {
                        console.error('Error resetting member avatar:', error);
                        showAlert('فشل تصفير صورة العضو.');
                    }
                });
            });

            document.querySelectorAll('.delete-member-btn').forEach(button => {
                button.addEventListener('click', async (e) => {
                    const memberId = e.currentTarget.dataset.id;
                    const confirmed = confirm('متأكد تبي تحذف هذا العضو؟ لا يمكن التراجع.');
                    if (!confirmed) return;

                    try {
                        const deleteMember = httpsCallable(functions, 'deleteMember');
                        await deleteMember({ memberId });
                        showAlert('تم حذف العضو بنجاح.');
                    } catch (error) {
                        console.error('Error deleting member:', error);
                        showAlert('فشل حذف العضو.');
                    }
                });
            });
        }, error => {
            console.error('Error loading members:', error);
                    membersList.innerHTML = '<p class="text-center text-red-500">ما قدرنا نحمّل المطانيخ.</p>';
        });
    } catch (error) {
        console.error('Error setting up members listener:', error);
        membersList.innerHTML = '<p class="text-center text-red-500">ما قدرنا نحمّل المطانيخ.</p>';
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
                    logList.innerHTML = '<p class="text-center">ما فيه سجل للقطة للحين.</p>';
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
                        <div>
                            <span class="font-bold">${escapeHtml(payment.userName || 'بدون اسم')}</span>
                            <small>${escapeHtml(date)}</small>
                        </div>
                        <span class="status-badge paid">تم السداد</span>
                    `;
                    logList.appendChild(div);
                });
            },
            error => {
                console.error('Error loading payment log:', error);
                logList.innerHTML = '<p class="text-center text-red-500">ما قدرنا نحمّل سجل القطة.</p>';
            }
        );
    } catch (error) {
        console.error('Error setting up payment listener:', error);
        logList.innerHTML = '<p class="text-center text-red-500">ما قدرنا نحمّل سجل القطة.</p>';
    }
}


async function applyPaymentSettingsView() {
    await loadAppSettings();

    const enabled = appSettings.paymentEnabled === true;

    const title = document.getElementById('payment-availability-title');
    const desc = document.getElementById('payment-availability-desc');
    const methodsNote = document.getElementById('payment-methods-note');

    const stcMethod = document.getElementById('stc-pay-method');
    const stcValue = document.getElementById('stc-pay-value');
    const copyStcBtn = document.getElementById('copy-stc-pay-button');

    const appleMethod = document.getElementById('apple-pay-method');
    const appleValue = document.getElementById('apple-pay-value');
    const appleStatus = document.getElementById('apple-pay-status');

    const beneficiaryCard = document.getElementById('payment-beneficiary-card');
    const beneficiaryName = document.getElementById('payment-beneficiary-name');

    const qrCard = document.getElementById('payment-qr-card');
    const qrImage = document.getElementById('payment-qr-image');

    if (title) title.textContent = enabled ? 'الدفع متاح حالياً' : 'الدفع الإلكتروني غير متاح حالياً';
    if (desc) desc.textContent = enabled
        ? 'اختر طريقة الدفع المناسبة لك من البيانات بالأسفل'
        : 'تابع السداد حالياً من السجل وسيتم تفعيل الدفع لاحقاً';

    if (methodsNote) methodsNote.textContent = enabled
        ? `مبلغ القطة الشهري: ${Number(appSettings.qattahAmount || 0)} ريال`
        : 'طرق الدفع مخفية حتى يتم تفعيلها من لوحة التحكم';

    if (stcMethod) stcMethod.classList.toggle('is-disabled', !enabled || !appSettings.stcPayNumber);
    if (stcValue) stcValue.textContent = enabled && appSettings.stcPayNumber ? appSettings.stcPayNumber : 'غير متاح حالياً';
    if (copyStcBtn) {
        copyStcBtn.classList.toggle('hidden', !(enabled && appSettings.stcPayNumber));
        copyStcBtn.onclick = () => copyToClipboard(appSettings.stcPayNumber || '');
    }

    if (appleMethod) appleMethod.classList.toggle('is-disabled', !enabled || !appSettings.applePayText);
    if (appleValue) appleValue.textContent = enabled && appSettings.applePayText ? appSettings.applePayText : 'غير متاح حالياً';
    if (appleStatus) appleStatus.textContent = enabled && appSettings.applePayText ? 'متاح' : 'قريباً';

    if (beneficiaryCard) beneficiaryCard.classList.toggle('hidden', !(enabled && appSettings.beneficiaryName));
    if (beneficiaryName) beneficiaryName.textContent = appSettings.beneficiaryName || '--';

    if (qrCard) qrCard.classList.toggle('hidden', !(enabled && appSettings.paymentQrUrl));
    if (qrImage && appSettings.paymentQrUrl) qrImage.src = safeExternalUrl(appSettings.paymentQrUrl, '');
}

async function loadPaymentOverview() {
    const paidCount = document.getElementById('payments-paid-count');
    const lateCount = document.getElementById('payments-late-count');
    const remainingCount = document.getElementById('payments-remaining-count');
    const lateMembersList = document.getElementById('late-members-list');

    if (!paidCount && !lateCount && !remainingCount && !lateMembersList) return;

    try {
        const snapshot = await getDocs(collection(db, "users"));
        const isAdminUser = auth.currentUser?.uid === ADMIN_UID || currentUser?.uid === ADMIN_UID;
        const members = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        const paid = members.filter((member) => member.paymentStatus === 'paid');
        const late = members.filter((member) => member.paymentStatus !== 'paid');

        if (paidCount) paidCount.textContent = String(paid.length);
        if (lateCount) lateCount.textContent = String(late.length);
        if (remainingCount) remainingCount.textContent = String(late.length);

        if (lateMembersList) {
            lateMembersList.innerHTML = late.length
                ? late.slice(0, 8).map((member) => {
                    const phoneLine = isAdminUser
                        ? `<small>${escapeHtml(member.phone || 'بدون رقم')}</small>`
                        : '';

                    return `
                        <div class="list-item-card text-sm">
                            <div>
                                <span class="font-bold">${escapeHtml(member.name || 'بدون اسم')}</span>
                                ${phoneLine}
                            </div>
                            <span class="status-badge overdue">متأخر</span>
                        </div>
                    `;
                }).join('')
                : '<p class="text-center">كل الأعضاء مسددين.</p>';
        }
    } catch (error) {
        console.warn('Payment overview unavailable:', error);
        if (lateMembersList) lateMembersList.innerHTML = '<p class="text-center text-red-500">ما قدرنا نحمّل المتأخرين.</p>';
    }
}
