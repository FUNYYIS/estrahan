from pathlib import Path

js = Path("assets/js/main.js")
css = Path("assets/css/main.css")

if not js.exists() or not css.exists():
    raise SystemExit("تأكد أنك داخل مجلد المشروع الصحيح")

js_text = js.read_text(encoding="utf-8")
css_text = css.read_text(encoding="utf-8")

marker = "ESTRAHA_ADMIN_SECTIONS_FULL_V1"

# backup
for p in [js, css]:
    b = p.with_suffix(p.suffix + ".backup-admin-sections")
    if not b.exists():
        b.write_text(p.read_text(encoding="utf-8"), encoding="utf-8")

# remove old same patch
if marker in js_text:
    js_text = js_text.split(f"/* {marker} */")[0]
if marker in css_text:
    css_text = css_text.split(f"/* {marker} */")[0]

css_text += f"""

/* {marker} */
.admin-control-home {{
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  gap: 14px;
  margin: 18px 0 22px;
}}

.admin-control-card {{
  background: #fff;
  border: 1px solid rgba(22, 101, 52, .12);
  border-radius: 22px;
  padding: 16px 14px;
  text-align: right;
  cursor: pointer;
  box-shadow: 0 10px 26px rgba(15,23,42,.07);
}}

.admin-control-card i {{
  color: #166534;
  width: 24px;
  height: 24px;
}}

.admin-control-card strong {{
  display: block;
  margin-top: 10px;
  font-size: 15px;
}}

.admin-control-card span {{
  display: block;
  margin-top: 5px;
  color: #64748b;
  font-size: 12px;
}}

.admin-extra-section {{
  background: #fff;
  border-radius: 22px;
  padding: 16px;
  margin: 14px 0;
  box-shadow: 0 10px 26px rgba(15,23,42,.06);
  border: 1px solid rgba(22, 101, 52, .10);
}}

.admin-extra-section h2 {{
  margin-bottom: 6px;
}}

.admin-extra-grid {{
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 12px;
  margin-top: 14px;
}}

.admin-extra-field {{
  display: flex;
  flex-direction: column;
  gap: 6px;
}}

.admin-extra-field label {{
  font-size: 13px;
  font-weight: 700;
}}

.admin-extra-field input,
.admin-extra-field select {{
  width: 100%;
  border: 1px solid #dbe3dc;
  border-radius: 14px;
  padding: 11px 12px;
  background: #f8faf8;
}}

.admin-section-back {{
  margin: 8px 0 14px;
}}

.admin-managed-section.is-hidden,
.admin-extra-section.is-hidden,
.admin-control-home.is-hidden {{
  display: none !important;
}}
"""

js_text += f"""

/* {marker} */
(function () {{
  const STORAGE_KEY = 'estraha_admin_extra_settings_v1';

  function getExtraSettings() {{
    try {{
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{{}}');
    }} catch (e) {{
      return {{}};
    }}
  }}

  function saveExtraSettings(data) {{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }}

  function initAdminSections() {{
    if (!location.hash.includes('admin-notifications')) return;
    if (document.querySelector('.admin-control-home')) return;

    const title = Array.from(document.querySelectorAll('h1,h2')).find(el =>
      (el.textContent || '').includes('لوحة التحكم')
    );
    if (!title) return;

    const root = title.closest('main, section, .page, .container') || document.body;
    const headerBox = title.closest('.card, .section-header, .page-header, div') || title;

    const cards = [
      ['qattah', 'hand-coins', 'إدارة القطة والدفع', 'المبلغ وطرق الدفع والتحويل'],
      ['members', 'users', 'إدارة الأعضاء', 'الأعضاء والصلاحيات'],
      ['design', 'palette', 'إدارة التصميم', 'الشعار والسبلاش والهوية'],
      ['notifications', 'bell', 'إدارة الإشعارات', 'الإرسال والاختبار والسجل'],
      ['matches', 'trophy', 'إدارة المباريات', 'تشغيل وعدد وتحديث'],
      ['news', 'newspaper', 'إدارة الأخبار', 'تشغيل وعدد ونوع الأخبار'],
      ['api', 'plug', 'إدارة الخدمات والـ API', 'روابط ومفاتيح الخدمات المجانية'],
      ['general', 'settings', 'الإعدادات العامة', 'إعدادات التطبيق العامة'],
    ];

    const home = document.createElement('div');
    home.className = 'admin-control-home';
    home.innerHTML = cards.map(c => `
      <button type="button" class="admin-control-card" data-admin-open="${{c[0]}}">
        <i data-lucide="${{c[1]}}"></i>
        <strong>${{c[2]}}</strong>
        <span>${{c[3]}}</span>
      </button>
    `).join('');

    headerBox.insertAdjacentElement('afterend', home);

    const extra = document.createElement('div');
    extra.innerHTML = `
      <section class="admin-extra-section is-hidden" data-admin-section="members">
        <h2><i data-lucide="users"></i> إدارة الأعضاء</h2>
        <p class="text-sm">قسم مخصص لإدارة الأعضاء والصلاحيات. الربط الكامل مع الأعضاء نضيفه بالخطوة الجاية.</p>
        <div class="admin-extra-grid">
          <button type="button" class="btn">عرض الأعضاء</button>
          <button type="button" class="btn secondary">إضافة عضو</button>
          <button type="button" class="btn secondary">إدارة الصلاحيات</button>
        </div>
      </section>

      <section class="admin-extra-section is-hidden" data-admin-section="matches">
        <h2><i data-lucide="trophy"></i> إدارة المباريات</h2>
        <p class="text-sm">تحكم سريع في قسم المباريات.</p>
        <div class="admin-extra-grid">
          <label class="admin-extra-field">
            <span>تشغيل قسم المباريات</span>
            <select id="admin-matches-enabled">
              <option value="true">تشغيل</option>
              <option value="false">إيقاف</option>
            </select>
          </label>
          <label class="admin-extra-field">
            <span>عدد المباريات المعروضة</span>
            <input id="admin-matches-limit" type="number" min="1" max="30" value="8">
          </label>
          <label class="admin-extra-field">
            <span>نوع العرض</span>
            <select id="admin-matches-mode">
              <option value="today">مباريات اليوم</option>
              <option value="upcoming">المباريات القادمة</option>
            </select>
          </label>
          <label class="admin-extra-field">
            <span>البطولة المفضلة</span>
            <select id="admin-matches-league">
              <option value="all">الكل</option>
              <option value="world-cup">كأس العالم</option>
              <option value="saudi">الدوري السعودي</option>
              <option value="champions">دوري الأبطال</option>
            </select>
          </label>
        </div>
        <div class="admin-extra-grid">
          <button type="button" class="btn" data-save-extra-admin>حفظ إعدادات المباريات</button>
          <button type="button" class="btn secondary" data-refresh-matches>تحديث الآن</button>
          <button type="button" class="btn secondary" data-test-match-notification>اختبار إشعار المباراة</button>
        </div>
      </section>

      <section class="admin-extra-section is-hidden" data-admin-section="news">
        <h2><i data-lucide="newspaper"></i> إدارة الأخبار</h2>
        <p class="text-sm">تحكم سريع في قسم الأخبار.</p>
        <div class="admin-extra-grid">
          <label class="admin-extra-field">
            <span>تشغيل الأخبار</span>
            <select id="admin-news-enabled">
              <option value="true">تشغيل</option>
              <option value="false">إيقاف</option>
            </select>
          </label>
          <label class="admin-extra-field">
            <span>عدد الأخبار</span>
            <input id="admin-news-limit" type="number" min="1" max="30" value="8">
          </label>
          <label class="admin-extra-field">
            <span>نوع الأخبار</span>
            <select id="admin-news-type">
              <option value="sports">رياضية فقط</option>
              <option value="local">محلية</option>
              <option value="general">عامة</option>
            </select>
          </label>
          <label class="admin-extra-field">
            <span>إخفاء الأخبار بدون صور</span>
            <select id="admin-news-hide-no-image">
              <option value="true">نعم</option>
              <option value="false">لا</option>
            </select>
          </label>
        </div>
        <div class="admin-extra-grid">
          <button type="button" class="btn" data-save-extra-admin>حفظ إعدادات الأخبار</button>
          <button type="button" class="btn secondary" data-refresh-news>تحديث الآن</button>
          <button type="button" class="btn secondary" data-clear-old-news>تنظيف الأخبار القديمة</button>
        </div>
      </section>

      <section class="admin-extra-section is-hidden" data-admin-section="api">
        <h2><i data-lucide="plug"></i> إدارة الخدمات والـ API</h2>
        <p class="text-sm">مفاتيح مجانية فقط. لا تستخدم هنا مفاتيح مدفوعة أو سرية.</p>
        <div class="admin-extra-grid">
          <label class="admin-extra-field">
            <span>News API URL</span>
            <input id="admin-news-api-url" type="url" placeholder="https://example.com/news">
          </label>
          <label class="admin-extra-field">
            <span>News API Key</span>
            <input id="admin-news-api-key" type="text" placeholder="free-api-key">
          </label>
          <label class="admin-extra-field">
            <span>Sports API URL</span>
            <input id="admin-sports-api-url" type="url" placeholder="https://example.com/matches">
          </label>
          <label class="admin-extra-field">
            <span>Sports API Key</span>
            <input id="admin-sports-api-key" type="text" placeholder="free-api-key">
          </label>
        </div>
        <div class="admin-extra-grid">
          <button type="button" class="btn" data-save-extra-admin>حفظ إعدادات API</button>
          <button type="button" class="btn secondary" data-test-news-api>اختبار أخبار</button>
          <button type="button" class="btn secondary" data-test-sports-api>اختبار مباريات</button>
        </div>
      </section>

      <section class="admin-extra-section is-hidden" data-admin-section="general">
        <h2><i data-lucide="settings"></i> الإعدادات العامة</h2>
        <p class="text-sm">معلومات التطبيق العامة.</p>
        <div class="admin-extra-grid">
          <label class="admin-extra-field">
            <span>رسالة الترحيب</span>
            <input id="admin-welcome-message" type="text" placeholder="نورت الاستراحة يا الأمير">
          </label>
          <label class="admin-extra-field">
            <span>رقم الإصدار</span>
            <input id="admin-app-version" type="text" placeholder="1.0.0">
          </label>
        </div>
        <button type="button" class="btn" data-save-extra-admin>حفظ الإعدادات العامة</button>
      </section>
    `;
    root.appendChild(extra);

    const keys = {{
      qattah: ['القطة', 'الدفع', 'مبلغ القطة', 'STC', 'Apple Pay', 'QR'],
      notifications: ['الإشعارات', 'إشعار', 'اختبار إشعار'],
      design: ['التصميم', 'الشعار', 'السبلاش', 'الخلفية', 'اسم الموقع', 'وصف الموقع'],
    }};

    Array.from(root.children).forEach(el => {{
      if (el === home || el === headerBox || el.contains(home) || el === extra) return;
      const text = (el.textContent || '').trim();
      if (!text) return;

      let section = 'general';
      if (keys.qattah.some(k => text.includes(k))) section = 'qattah';
      else if (keys.notifications.some(k => text.includes(k))) section = 'notifications';
      else if (keys.design.some(k => text.includes(k))) section = 'design';

      el.classList.add('admin-managed-section', 'is-hidden');
      el.dataset.adminSection = section;
    }});

    function fillSettings() {{
      const s = getExtraSettings();
      const map = {{
        'admin-matches-enabled': s.matchesEnabled ?? 'true',
        'admin-matches-limit': s.matchesLimit ?? '8',
        'admin-matches-mode': s.matchesMode ?? 'today',
        'admin-matches-league': s.matchesLeague ?? 'all',
        'admin-news-enabled': s.newsEnabled ?? 'true',
        'admin-news-limit': s.newsLimit ?? '8',
        'admin-news-type': s.newsType ?? 'sports',
        'admin-news-hide-no-image': s.newsHideNoImage ?? 'true',
        'admin-news-api-url': s.newsApiUrl ?? '',
        'admin-news-api-key': s.newsApiKey ?? '',
        'admin-sports-api-url': s.sportsApiUrl ?? '',
        'admin-sports-api-key': s.sportsApiKey ?? '',
        'admin-welcome-message': s.welcomeMessage ?? '',
        'admin-app-version': s.appVersion ?? '',
      }};
      Object.entries(map).forEach(([id, val]) => {{
        const el = document.getElementById(id);
        if (el) el.value = val;
      }});
    }}

    function collectSettings() {{
      const ids = [
        'admin-matches-enabled','admin-matches-limit','admin-matches-mode','admin-matches-league',
        'admin-news-enabled','admin-news-limit','admin-news-type','admin-news-hide-no-image',
        'admin-news-api-url','admin-news-api-key','admin-sports-api-url','admin-sports-api-key',
        'admin-welcome-message','admin-app-version'
      ];
      const data = getExtraSettings();
      ids.forEach(id => {{
        const el = document.getElementById(id);
        if (!el) return;
        const key = id.replace('admin-', '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        data[key] = el.value;
      }});
      saveExtraSettings(data);
      if (typeof showAlert === 'function') showAlert('تم حفظ الإعدادات.');
      else alert('تم حفظ الإعدادات.');
    }}

    function showHome() {{
      home.classList.remove('is-hidden');
      document.querySelectorAll('.admin-managed-section,.admin-extra-section').forEach(el => el.classList.add('is-hidden'));
      window.scrollTo({{ top: 0, behavior: 'smooth' }});
      if (window.lucide) window.lucide.createIcons();
    }}

    function showSection(id) {{
      home.classList.add('is-hidden');
      document.querySelectorAll('.admin-managed-section,.admin-extra-section').forEach(el => {{
        el.classList.toggle('is-hidden', el.dataset.adminSection !== id);
      }});

      const first = document.querySelector(`[data-admin-section="${{id}}"]:not(.is-hidden)`);
      if (first && !first.querySelector('.admin-section-back')) {{
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'btn admin-section-back';
        back.textContent = 'رجوع للوحة التحكم';
        back.addEventListener('click', showHome);
        first.prepend(back);
      }}

      fillSettings();
      window.scrollTo({{ top: 0, behavior: 'smooth' }});
      if (window.lucide) window.lucide.createIcons();
    }}

    home.addEventListener('click', e => {{
      const btn = e.target.closest('[data-admin-open]');
      if (!btn) return;
      showSection(btn.dataset.adminOpen);
    }});

    document.addEventListener('click', e => {{
      if (e.target.closest('[data-save-extra-admin]')) collectSettings();
      if (e.target.closest('[data-refresh-news]')) location.reload();
      if (e.target.closest('[data-refresh-matches]')) location.reload();
      if (e.target.closest('[data-test-news-api]')) alert('اختبار الأخبار جاهز. الربط الفعلي نضيفه بعد تحديد مصدر API.');
      if (e.target.closest('[data-test-sports-api]')) alert('اختبار المباريات جاهز. الربط الفعلي نضيفه بعد تحديد مصدر API.');
      if (e.target.closest('[data-test-match-notification]')) alert('اختبار إشعار المباراة جاهز.');
      if (e.target.closest('[data-clear-old-news]')) alert('تنظيف الأخبار القديمة جاهز.');
    }});

    fillSettings();
    showHome();
  }}

  document.addEventListener('DOMContentLoaded', initAdminSections);
  window.addEventListener('hashchange', () => setTimeout(initAdminSections, 250));
  setTimeout(initAdminSections, 700);
}})();
"""

js.write_text(js_text, encoding="utf-8")
css.write_text(css_text, encoding="utf-8")

print("تمت إضافة أقسام لوحة التحكم بنجاح ✅")
print("تم أخذ نسخة احتياطية من main.js و main.css")
