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

    if (!navigator.geolocation) {
        prayerContainer.innerHTML = `<p class="text-yellow-400 text-center w-full">جهازك ما يدعم تحديد الموقع.</p>`;
        return;
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
                prayerContainer.innerHTML = `<p class="text-red-400 text-center w-full">ما قدرنا نجيب المواقيت.</p>`;
            }
        },
        () => {
            prayerContainer.innerHTML = `<p class="text-yellow-400 text-center w-full">فعّل الموقع عشان نجيب المواقيت.</p>`;
        }
    );
}

async function loadHomeWeather() {
    const tempElement = document.getElementById('weather-temp');
    const descElement = document.getElementById('weather-desc');
    const locationElement = document.getElementById('weather-location');
    if (!tempElement || !descElement) return;

    const coords = await getCurrentPositionSafe().catch(() => null);

    if (!coords) {
        tempElement.textContent = '--°';
        descElement.textContent = 'فعّل الموقع لعرض الطقس';
        if (locationElement) locationElement.textContent = 'الموقع غير محدد';
        return;
    }

    try {
        if (locationElement) locationElement.textContent = coords.label || 'موقعك';
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current=temperature_2m,weather_code&timezone=auto`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Open-Meteo returned ${response.status}`);
        const data = await response.json();
        const current = data.current || {};
        tempElement.textContent = Number.isFinite(current.temperature_2m)
            ? `${Math.round(current.temperature_2m)}°`
            : '--°';
        descElement.textContent = weatherCodeLabel(current.weather_code);
    } catch (error) {
        console.warn('Weather unavailable:', error);
        tempElement.textContent = '--°';
        descElement.textContent = 'الطقس غير متاح';
    }
}

function getCurrentPositionSafe() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation unavailable'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                label: 'موقعك'
            }),
            reject,
            { timeout: 4200, maximumAge: 600000 }
        );
    });
}

function weatherCodeLabel(code) {
    const labels = {
        0: 'صحو',
        1: 'غالباً صافي',
        2: 'غيم خفيف',
        3: 'غائم',
        45: 'ضباب',
        48: 'ضباب كثيف',
        51: 'رذاذ خفيف',
        53: 'رذاذ',
        55: 'رذاذ قوي',
        61: 'مطر خفيف',
        63: 'مطر',
        65: 'مطر قوي',
        80: 'زخات خفيفة',
        81: 'زخات مطر',
        82: 'زخات قوية',
        95: 'رعد'
    };
    return labels[code] || 'طقس متغير';
}

async function loadHomeMembersSummary() {
    const membersCount = document.getElementById('home-members-count');
    const activeCount = document.getElementById('home-active-count');
    const unpaidCount = document.getElementById('home-unpaid-count');
    const percentElement = document.getElementById('home-qattah-percent');
    const paidElement = document.getElementById('home-paid-count');
    const lateElement = document.getElementById('home-late-count');
    const meter = document.getElementById('home-qattah-meter');

    if (!membersCount && !percentElement) return;

    try {
        const snapshot = await getDocs(collection(db, "users"));
        const members = snapshot.docs.map((item) => item.data());
        const total = members.length;
        const paid = members.filter((member) => member.paymentStatus === 'paid').length;
        const late = Math.max(total - paid, 0);
        const percent = total ? Math.round((paid / total) * 100) : 0;

        if (membersCount) membersCount.textContent = total ? String(total) : '0';
        if (activeCount) activeCount.textContent = `${paid} مسدد`;
        if (unpaidCount) unpaidCount.textContent = `${late} متأخر`;
        if (percentElement) percentElement.textContent = total ? `${percent}%` : '0%';
        if (paidElement) paidElement.textContent = String(paid);
        if (lateElement) lateElement.textContent = String(late);
        if (meter) meter.style.setProperty('--value', `${percent}%`);
    } catch (error) {
        console.warn('Home member summary unavailable:', error);
        if (membersCount) membersCount.textContent = '--';
        if (percentElement) percentElement.textContent = '--';
    }
}

async function loadHomeChatPreview() {
    const container = document.getElementById('home-chat-preview');
    if (!container) return;

    try {
        const snapshot = await getDocs(query(collection(db, "chat"), orderBy("createdAt", "desc"), limit(3)));
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-center">ما فيه رسائل للحين.</p>';
            return;
        }

        container.innerHTML = snapshot.docs.map((item) => {
            const message = item.data();
            return `
                <span>
                    ${escapeHtml(message.userName || 'واحد من الربع')}
                    <b>${escapeHtml(message.text || '')}</b>
                </span>
            `;
        }).join('');
    } catch (error) {
        console.warn('Home chat preview unavailable:', error);
        container.innerHTML = '<p class="text-center">الدردشة ما ظهرت حالياً.</p>';
    }
}

async function loadHomeMatches() {
    const container = document.getElementById('home-matches-list');
    if (!container) return;
    await loadMatches(container, 3, true);
}

async function loadHomeNews() {
    const container = document.getElementById('home-arabiya-news-list');
    if (!container) return;
    await loadNews(container, 3);
}


async function loadPrayerTimes() {
    const container = document.getElementById('prayer-times-container');
    if (!container) return;

    container.innerHTML = `<p class="text-center w-full">اسمح بالموقع عشان نجيب المواقيت...</p>`;

    if (!navigator.geolocation) {
        container.innerHTML = `<p class="text-yellow-400 text-center w-full">جهازك ما يدعم تحديد الموقع.</p>`;
        return;
    }

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
                container.innerHTML = `<p class="text-red-400 text-center w-full">ما قدرنا نجيب مواقيت الصلاة.</p>`;
            }
        },
        () => {
            container.innerHTML = `<p class="text-yellow-400 text-center w-full">الموقع مقفل، ما نقدر نعرض المواقيت.</p>`;
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

    if (!navigator.geolocation) {
        status.textContent = 'جهازك ما يدعم تحديد الموقع.';
        return;
    }

    status.textContent = "اسمح بالموقع عشان نحدد القبلة...";

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

                status.textContent = "حرك جوالك وبتضبط معك القبلة";
                compass.style.display = 'block';

                if (window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission === 'function') {
                    try {
                        const permission = await window.DeviceOrientationEvent.requestPermission();
                        if (permission === 'granted') {
                            window.addEventListener('deviceorientation', handleOrientation);
                        } else {
                            status.textContent = 'تم رفض حساس الحركة.';
                        }
                    } catch (permError) {
                        console.error('Permission request error:', permError);
                        status.textContent = 'صار خطأ بطلب الإذن.';
                    }
                } else if ('DeviceOrientationEvent' in window) {
                    window.addEventListener('deviceorientation', handleOrientation);
                } else {
                    status.textContent = 'جهازك ما يدعم تحديد الاتجاه.';
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
                status.textContent = 'ما قدرنا نحسب اتجاه القبلة.';
            }
        },
        () => {
            status.textContent = 'الموقع مقفل، ما نقدر نعرض القبلة.';
        }
    );
}
