async function handleChatBoxClick(event) {
    const toggleBtn = event.target.closest('.chat-admin-toggle');
    if (toggleBtn) {
        event.stopPropagation();
        const menu = toggleBtn.nextElementSibling;
        const isOpen = menu?.classList.contains('is-open');
        document.querySelectorAll('.chat-admin-menu.is-open').forEach(m => {
            m.classList.remove('is-open');
            m.previousElementSibling?.setAttribute('aria-expanded', 'false');
        });
        if (!isOpen && menu) {
            menu.classList.add('is-open');
            toggleBtn.setAttribute('aria-expanded', 'true');
        }
        return;
    }

    const pinBtn = event.target.closest('.pin-chat-message-btn');
    if (pinBtn) {
        const messageId = pinBtn.dataset.id;
        if (!messageId) return;
        try {
            await setDoc(doc(db, 'settings', 'app'), { pinnedMessageId: messageId }, { merge: true });
            appSettings.pinnedMessageId = messageId;
            showAlert('تم تثبيت الرسالة.');
        } catch (error) {
            console.error('Pin message failed:', error);
            showAlert('فشل تثبيت الرسالة.');
        }
        return;
    }

    const muteBtn = event.target.closest('.mute-chat-user-btn');
    if (muteBtn) {
        const userId = muteBtn.dataset.userId;
        if (!userId) return;
        if (!await showConfirm('متأكد تبي تكتم هذا العضو؟')) return;
        try {
            await loadAppSettings();
            const muted = Array.isArray(appSettings.mutedUserIds) ? [...appSettings.mutedUserIds] : [];
            if (!muted.includes(userId)) muted.push(userId);
            await setDoc(doc(db, 'settings', 'app'), { mutedUserIds: muted }, { merge: true });
            appSettings.mutedUserIds = muted;
            showAlert('تم كتم العضو.');
        } catch (error) {
            console.error('Mute user failed:', error);
            showAlert('فشل كتم العضو.');
        }
        return;
    }

    const deleteBtn = event.target.closest('.delete-chat-message-btn');
    if (deleteBtn) {
        const messageId = deleteBtn.dataset.id;
        if (!await showConfirm('متأكد تبي تحذف الرسالة؟') || !messageId) return;
        try {
            await deleteDoc(doc(db, "chat", messageId));
            showAlert('تم حذف الرسالة.');
        } catch (error) {
            console.error('Chat message delete failed:', error);
            showAlert('فشل حذف الرسالة.');
        }
    }
}

function loadChat() {
    const chatBox = document.getElementById('chat-box');
    if (!chatBox) {
        console.warn('chat-box element not found');
        return;
    }

    const searchInput = document.getElementById('chat-search-input');
    if (searchInput && searchInput.dataset.bound !== 'true') {
        searchInput.dataset.bound = 'true';
        searchInput.addEventListener('input', () => renderChatMessages(chatBox));
    }

    if (chatBox.dataset.delegationBound !== 'true') {
        chatBox.dataset.delegationBound = 'true';
        chatBox.addEventListener('click', handleChatBoxClick);
    }

    if (!document.body.dataset.chatMenuBound) {
        document.body.dataset.chatMenuBound = 'true';
        document.addEventListener('click', () => {
            document.querySelectorAll('.chat-admin-menu.is-open').forEach(m => {
                m.classList.remove('is-open');
                m.previousElementSibling?.setAttribute('aria-expanded', 'false');
            });
        });
    }

    try {
        unsubscribeChat = onSnapshot(
            query(collection(db, "chat"), orderBy("createdAt", "desc"), limit(50)),
            async (snapshot) => {
                chatMessagesCache = snapshot.docs
                    .map((item) => ({ id: item.id, ...item.data() }))
                    .reverse();
                await hydrateChatUsersForMessages(chatMessagesCache);
                renderChatMessages(chatBox);
            },
            error => {
                console.error('Error loading chat:', error);
                chatBox.innerHTML = '<p class="text-center text-red-500">ما قدرنا نحمّل الدردشة.</p>';
            }
        );
    } catch (error) {
        console.error('Error setting up chat listener:', error);
        chatBox.innerHTML = '<p class="text-center text-red-500">ما قدرنا نحمّل الدردشة.</p>';
    }
}

async function hydrateChatUsersForMessages(messages = []) {
    const userIds = Array.from(new Set(
        messages
            .map((message) => message.userId)
            .filter((userId) => userId && !chatUsersCache.has(userId))
    ));

    if (!userIds.length) return;

    await Promise.all(userIds.map(async (userId) => {
        try {
            const userSnapshot = await getDoc(doc(db, 'users', userId));
            if (userSnapshot.exists()) {
                chatUsersCache.set(userId, userSnapshot.data());
            }
        } catch (error) {
            console.warn('Chat user profile unavailable:', error);
        }
    }));
}

function renderChatMessages(chatBox) {
    const searchTerm = (document.getElementById('chat-search-input')?.value || '').trim().toLowerCase();
    const messages = chatMessagesCache.filter((msg) => {
        if (!searchTerm) return true;
        return `${msg.userName || ''} ${msg.text || ''}`.toLowerCase().includes(searchTerm);
    });
    const shouldStickToBottom = chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight < 120;

    chatBox.innerHTML = '';

    if (!messages.length) {
        chatBox.innerHTML = '<p class="text-center">ما فيه رسائل مطابقة.</p>';
        return;
    }

    messages.forEach(msg => {
        const div = document.createElement('div');
        const isMe = msg.userId === auth.currentUser?.uid;
        div.className = `chat-message-row ${isMe ? 'is-me' : ''}`;

        const userDisplayName = msg.userName || 'مستخدم';
        const messageText = escapeHtml(msg.text || '');
        const time = formatMessageTime(msg.createdAt);
        const initials = getAvatarInitials(userDisplayName);
        const profile = chatUsersCache.get(msg.userId) || {};
        const avatarUrl = getSafeAvatarUrl(msg.avatarUrl || profile.avatarUrl || (isMe ? currentUser?.avatarUrl : '')) || 'assets/images/estraha-logo.svg';
        const avatarContent = `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(userDisplayName)}" loading="lazy" decoding="async">`;
        const adminChatControls = (auth.currentUser?.uid === ADMIN_UID || currentUser?.uid === ADMIN_UID)
            ? `<div class="chat-admin-actions">
                 <button type="button" class="chat-admin-toggle" aria-label="خيارات الرسالة" aria-expanded="false">
                   <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                 </button>
                 <div class="chat-admin-menu" role="menu">
                   <button type="button" class="pin-chat-message-btn" data-id="${escapeHtml(msg.id)}">تثبيت</button>
                   <button type="button" class="mute-chat-user-btn" data-user-id="${escapeHtml(msg.userId || '')}">كتم</button>
                   <button type="button" class="delete-chat-message-btn" data-id="${escapeHtml(msg.id)}">حذف</button>
                 </div>
               </div>`
            : '';

        div.innerHTML = `
            <div class="chat-avatar">${avatarContent}</div>
            <div class="chat-message-stack">
                <div class="chat-message-meta">
                    <strong>${appSettings.pinnedMessageId === msg.id ? '📌 ' : ''}${escapeHtml(userDisplayName)}</strong>
                    <span>${escapeHtml(time)}</span>
                    ${adminChatControls}
                </div>
                <div class="message ${isMe ? 'mine' : ''}">
                    <p>${messageText}</p>
                </div>
            </div>
        `;
        chatBox.appendChild(div);
    });



    if (shouldStickToBottom) {
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

function formatMessageTime(timestamp) {
    if (!timestamp?.seconds) return '';
    return new Date(timestamp.seconds * 1000).toLocaleTimeString('ar-SA', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getAvatarInitials(name = '') {
    return String(name || 'مستخدم')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0] || '')
        .join('') || 'م';
}

function getSafeAvatarUrl(value = '') {
    const url = String(value || '').trim();
    if (!url) return '';
    if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(url)) return url;

    try {
        const parsed = new URL(url, window.location.origin);
        return parsed.protocol === 'https:' ? parsed.href : '';
    } catch {
        return '';
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
        showAlert('اكتب رسالتك أول.');
        return;
    }

    if (!currentUser) {
        showAlert('لازم تقلط أول.');
        return;
    }

    await loadAppSettings();

    if (appSettings.chatEnabled === false) {
        showAlert('الدردشة مقفلة مؤقتاً.');
        return;
    }

    if (Array.isArray(appSettings.mutedUserIds) && appSettings.mutedUserIds.includes(currentUser.uid)) {
        showAlert('تم كتمك مؤقتاً من الدردشة.');
        return;
    }

    try {
        await addDoc(collection(db, "chat"), {
            text: text,
            userId: currentUser.uid,
            userName: currentUser.name || 'مستخدم',
            avatarUrl: currentUser.avatarUrl || '',
            createdAt: serverTimestamp()
        });
        input.value = '';
    } catch (error) {
        console.error('Error sending message:', error);
        showAlert('ما قدرت أرسل الرسالة: ' + (error.message || 'جرّب مرة ثانية'));
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
