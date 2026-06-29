const { test, expect } = require('@playwright/test');
const { installAppMocks } = require('./mocks');

async function expectSome(locator) {
  expect(await locator.count()).toBeGreaterThan(0);
}

async function openApp(page, hash = '#home', params = 'e2eAuth=1') {
  const query = params ? `?${params}` : '';
  await page.goto(`/index.html${query}${hash}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#page-content')).toBeVisible();
}

test('opens login and reaches registration only after mocked OTP verification', async ({ page }) => {
  const monitor = await installAppMocks(page);

  await openApp(page, '#login', '');
  await expect(page.getByRole('heading', { name: 'أقلط' })).toBeVisible();
  await expect(page.getByPlaceholder('05XXXXXXXX')).toBeVisible();
  await expect(page.getByText('سجل معنا يا الذيب')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (
    globalThis.__estrahaAppCheckOptions?.options?.provider?.siteKey || ''
  ))).toBe('6LefADUtAAAAADEsmCDdvhNJl6RcDbNqMv88YR1o');

  await openApp(page, '#register', '');
  await expect(page).toHaveURL(/#login$/);
  await expect(page.locator('#register-invite-code')).toHaveCount(0);

  await openApp(page, '#login', 'e2eNewUser=1');
  await page.getByPlaceholder('05XXXXXXXX').fill('0500000000');
  await page.getByRole('button', { name: 'أرسل رمز الدخول' }).click();
  await expect(page.locator('#verification-code')).toBeVisible();
  await page.locator('#verification-code').fill('123456');
  await page.getByRole('button', { name: 'تحقق واقلط' }).click();
  await expect(page.locator('#register-invite-code')).toBeVisible();
  await expect(page.getByRole('button', { name: 'سجل وادخل' })).toBeVisible();

  monitor.assertClean();
});

test('navigates the main authenticated PWA pages', async ({ page }) => {
  const monitor = await installAppMocks(page);

  await openApp(page, '#home');
  await expect(page.getByRole('heading', { name: 'تطبيق الاستراحة' })).toBeVisible();

  const pages = [
    ['#chat', 'الدردشة'],
    ['#matches', 'المباريات'],
    ['#payments', 'القطة'],
    ['#news', 'الأخبار'],
    ['#members', 'الأعضاء'],
    ['#prayer', 'مواقيت الصلاة'],
    ['#settings', 'الإعدادات'],
    ['#profile-settings', 'بياناتك']
  ];

  for (const [hash, title] of pages) {
    await page.goto(`/index.html?e2eAuth=1${hash}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#page-content')).toContainText(title);
  }

  monitor.assertClean();
});

test('clicks SPA navigation links without falling back to home', async ({ page }) => {
  const monitor = await installAppMocks(page);

  await openApp(page, '#home');

  const bottomNavTargets = [
    ['#bottom-nav a[href="#chat"]', '#chat', 'الدردشة'],
    ['#bottom-nav a[href="#matches"]', '#matches', 'المباريات'],
    ['#bottom-nav a[href="#payments"]', '#payments', 'القطة'],
    ['#bottom-nav a[href="#settings"]', '#settings', 'الإعدادات']
  ];

  for (const [selector, hash, title] of bottomNavTargets) {
    await page.locator(selector).click();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(hash);
    await expect(page.locator('#page-content')).toContainText(title);
  }

  const settingsTargets = [
    ['#profile-settings', 'بياناتك'],
    ['#notifications-settings', 'الإشعارات']
  ];

  for (const [hash, title] of settingsTargets) {
    await page.locator('#bottom-nav a[href="#settings"]').click();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#settings');
    await page.locator(`#page-content a[href="${hash}"]`).first().click();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(hash);
    await expect(page.locator('#page-content')).toContainText(title);
  }

  monitor.assertClean();
});

test('renders home, news cards, images, matches, prayer, payments, chat and profile data', async ({ page }) => {
  const monitor = await installAppMocks(page);

  await openApp(page, '#home');
  await expect(page.locator('#home-arabiya-news-list .compact-news-item')).toHaveCount(3);
  await expect(page.locator('#home-arabiya-news-list img.compact-news-thumb')).toHaveCount(3);
  await expect(page.locator('#page-content')).toContainText('FIFA World Cup 2026');
  await expect(page.locator('#home-prayer-times')).toContainText('الفجر');
  await expect(page.locator('#page-content')).toContainText('القطة');
  await expect(page.locator('#home-chat-preview')).toContainText('رسالة اختبار');

  await page.goto('/index.html?e2eAuth=1#news', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#arabiya-news-list .compact-news-item')).toHaveCount(3);
  await expect(page.locator('#arabiya-news-list img.compact-news-thumb')).toHaveCount(3);

  await page.goto('/index.html?e2eAuth=1#payments', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#page-content')).toContainText('100');

  await page.goto('/index.html?e2eAuth=1#profile-settings', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#page-content')).toContainText('عضو الاختبار');

  monitor.assertClean();
});

test('uses saved prayer location without sending real location data', async ({ page }) => {
  const monitor = await installAppMocks(page);

  await openApp(page, '#prayer');
  await expect(page.locator('#prayer-times-container')).toContainText('الفجر');
  await expect(page.locator('#page-content')).toContainText('اتجاه القبلة');
  await expect(page.locator('#qibla-container')).toContainText('تحقق من إذن الوصول للموقع.');
  await expect(page.locator('#qibla-status')).toContainText(/القبلة|الاتجاه|الموقع|الحركة/);

  const saveLocation = page.locator('#save-prayer-location');
  if (await saveLocation.count()) {
    await saveLocation.click();
    await expect(page.locator('#prayer-location-status')).toContainText(/تم|حفظ|موقع|الصلاة/);
  }

  monitor.assertClean();
});

test('hides member phone numbers from regular members and shows them to admins', async ({ page }) => {
  const monitor = await installAppMocks(page);

  await openApp(page, '#members');
  await expect(page.locator('#members-list')).toContainText('عضو الاختبار');
  await expect(page.locator('#members-list')).not.toContainText('0500000000');

  await page.goto('/index.html?e2eAuth=1#payments', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#late-members-list')).toContainText('مشرف الاختبار');
  await expect(page.locator('#late-members-list')).not.toContainText('0555555555');

  await page.goto('/index.html?e2eAdmin=1#members', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#members-list')).toContainText('0500000000');

  monitor.assertClean();
});

test('opens admin notifications tabs with mocked callable functions', async ({ page }) => {
  const monitor = await installAppMocks(page);

  await openApp(page, '#admin-notifications', 'e2eAdmin=1');
  await expect(page.locator('.admin-tabs')).toBeVisible();
  await expectSome(page.locator('[data-admin-tab="general"]:not([hidden])'));

  await page.locator('[data-admin-tab-target="notifications"]').click();
  await expectSome(page.locator('[data-admin-tab="notifications"]:not([hidden])'));

  const matchTest = page.locator('[data-admin-test-notification="match"]');
  await expect(matchTest).toBeVisible();
  await matchTest.click();
  await expect(page.locator('#admin-notification-report')).toBeVisible();

  monitor.assertClean();
});

test('serves offline page and keeps app shell available offline', async ({ page, context }) => {
  const monitor = await installAppMocks(page);

  await page.goto('/offline.html', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'الاتصال بالإنترنت غير متاح' })).toBeVisible();
  await expect(page.locator('[data-last-updated-key="news"]')).toBeVisible();

  await openApp(page, '#home');
  await context.setOffline(true);
  await page.goto('/index.html?e2eAuth=1#home', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#page-content')).toBeVisible();
  await context.setOffline(false);

  monitor.assertClean();
});
