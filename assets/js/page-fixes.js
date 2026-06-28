import './runtime-ux.js';

let orientationHandler = null;

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function qiblaBearing(latitude, longitude) {
  const kaabaLatitude = toRadians(21.422487);
  const kaabaLongitude = toRadians(39.826206);
  const userLatitude = toRadians(latitude);
  const userLongitude = toRadians(longitude);
  const deltaLongitude = kaabaLongitude - userLongitude;

  const y = Math.sin(deltaLongitude) * Math.cos(kaabaLatitude);
  const x = Math.cos(userLatitude) * Math.sin(kaabaLatitude)
    - Math.sin(userLatitude) * Math.cos(kaabaLatitude) * Math.cos(deltaLongitude);

  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('الموقع غير مدعوم على هذا الجهاز.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000
    });
  });
}

function qiblaLocationError(error) {
  if (error?.code === 1) return 'إذن الموقع مرفوض. فعّله من إعدادات التطبيق ثم جرّب.';
  if (error?.code === 2) return 'تعذر تحديد موقعك الآن. تأكد من تشغيل خدمات الموقع.';
  if (error?.code === 3) return 'تأخر تحديد الموقع. جرّب مرة ثانية.';
  return error?.message || 'تعذر تشغيل القبلة.';
}

function bindQiblaFix() {
  const button = document.getElementById('qibla-enable-button');
  const status = document.getElementById('qibla-fix-status');
  const compass = document.getElementById('qibla-fix-compass');
  const needle = document.getElementById('qibla-fix-arrow');

  if (!button || !status || !compass || !needle || button.dataset.bound === 'true') return;
  button.dataset.bound = 'true';

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'جاري التفعيل...';
    status.textContent = 'نتحقق من الموقع والحساس...';

    try {
      let motionPermission = 'not-required';
      if (window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission === 'function') {
        motionPermission = await window.DeviceOrientationEvent.requestPermission();
      }

      const position = await getPosition();
      const bearing = qiblaBearing(position.coords.latitude, position.coords.longitude);

      compass.hidden = false;
      needle.style.transform = `translateX(-50%) rotate(${bearing}deg)`;

      if (orientationHandler) {
        window.removeEventListener('deviceorientation', orientationHandler, true);
        window.removeEventListener('deviceorientationabsolute', orientationHandler, true);
      }

      const orientationAvailable = 'DeviceOrientationEvent' in window && motionPermission !== 'denied';

      if (orientationAvailable) {
        orientationHandler = (event) => {
          let heading = null;
          if (Number.isFinite(event.webkitCompassHeading)) {
            heading = event.webkitCompassHeading;
          } else if (Number.isFinite(event.alpha)) {
            heading = (360 - event.alpha) % 360;
          }
          if (!Number.isFinite(heading)) return;
          const relativeDirection = (bearing - heading + 360) % 360;
          needle.style.transform = `translateX(-50%) rotate(${relativeDirection}deg)`;
        };

        window.addEventListener('deviceorientationabsolute', orientationHandler, true);
        window.addEventListener('deviceorientation', orientationHandler, true);
        status.textContent = 'القبلة جاهزة. حرّك الجوال حتى يتجه السهم للأعلى.';
      } else {
        status.textContent = 'تم تحديد اتجاه القبلة. فعّل إذن الحركة من إعدادات الجهاز لدقة أعلى.';
      }

      button.textContent = 'إعادة تحديد القبلة';
    } catch (error) {
      console.error('Qibla activation failed:', error);
      status.textContent = qiblaLocationError(error);
      button.textContent = 'جرّب مرة ثانية';
    } finally {
      button.disabled = false;
    }
  });
}

function initPageFixes() {
  window.EstrahaNews?.init();
  bindQiblaFix();
}

function startPageObserver() {
  const pageContent = document.getElementById('page-content');
  if (!pageContent) return;

  const observer = new MutationObserver(() => {
    window.requestAnimationFrame(initPageFixes);
  });

  observer.observe(pageContent, { childList: true, subtree: false });
  initPageFixes();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startPageObserver, { once: true });
} else {
  startPageObserver();
}

window.addEventListener('hashchange', () => setTimeout(initPageFixes, 0));
