from pathlib import Path

html = Path("pages/admin-notifications.html")
css = Path("assets/css/main.css")
js = Path("assets/js/main.js")

for p in (html, css, js):
    if not p.exists():
        raise SystemExit(f"Missing file: {p}")

# Backup
for p in (html, css, js):
    backup = p.with_suffix(p.suffix + ".before-admin-sections")
    if not backup.exists():
        backup.write_text(p.read_text(encoding="utf-8"), encoding="utf-8")

# CSS
css_text = css.read_text(encoding="utf-8")
if "ADMIN_DASHBOARD_SECTIONS_PATCH" not in css_text:
    css_text += r'''

/* ADMIN_DASHBOARD_SECTIONS_PATCH */
.admin-sections-home {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 14px;
  margin: 18px 0;
}

.admin-section-card {
  border: 1px solid rgba(22, 101, 52, .12);
  background: rgba(255,255,255,.78);
  backdrop-filter: blur(14px);
  border-radius: 22px;
  padding: 18px 14px;
  text-align: right;
  cursor: pointer;
  box-shadow: 0 10px 28px rgba(15, 23, 42, .07);
  transition: .2s ease;
}

.admin-section-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 34px rgba(15, 23, 42, .10);
}

.admin-section-card i {
  width: 24px;
  height: 24px;
  margin-bottom: 10px;
  color: #166534;
}

.admin-section-card strong {
  display: block;
  font-size: 15px;
}

.admin-section-card span {
  display: block;
  margin-top: 5px;
  font-size: 12px;
  color: #64748b;
}

.admin-section-back {
  margin: 10px 0 16px;
}

.admin-managed-section.is-hidden,
.admin-sections-home.is-hidden {
  display: none !important;
}
'''
    css.write_text(css_text, encoding="utf-8")

# JS
js_text = js.read_text(encoding="utf-8")
if "ADMIN_DASHBOARD_SECTIONS_PATCH" not in js_text:
    js_text += r'''

/* ADMIN_DASHBOARD_SECTIONS_PATCH */
(function () {
  function setupAdminSections() {
    const page = document.querySelector('#admin-notifications, [data-page="admin-notifications"]') || document.body;
    if (!location.hash.includes('admin-notifications') && !document.querySelector('h2')) return;
    if (document.querySelector('.admin-sections-home')) return;

    const title = Array.from(document.querySelectorAll('h1,h2')).find(el =>
      (el.textContent || '').includes('لوحة التحكم')
    );
    if (!title) return;

    const adminRoot = title.closest('section, main, .page, .page-content, .container') || page;

    const cards = [
      { id: 'qattah', icon: 'hand-coins', title: 'إدارة القطة', desc: 'المبلغ والسداد والمدفوعات', keys: ['إدارة القطة', 'إعدادات القطة', 'القطة والدفع', 'مبلغ القطة', 'طرق الدفع', 'الدفع'] },
      { id: 'members', icon: 'users', title: 'إدارة الأعضاء', desc: 'الأعضاء والصلاحيات', keys: ['الأعضاء', 'عضو', 'الصلاحيات', 'المستخدمين'] },
      { id: 'notifications', icon: 'bell', title: 'إدارة الإشعارات', desc: 'التنبيهات والاختبارات', keys: ['الإشعارات', 'إشعار', 'اختبار إشعار'] },
      { id: 'matches', icon: 'trophy', title: 'إدارة المباريات', desc: 'المباريات والتنبيهات', keys: ['المباريات', 'مباراة', 'الكورة'] },
      { id: 'news', icon: 'newspaper', title: 'إدارة الأخبار', desc: 'الأخبار والمصادر', keys: ['الأخبار', 'خبر', 'مصادر الأخبار'] },
      { id: 'design', icon: 'palette', title: 'إدارة التصميم', desc: 'الشعار والسبلاش والهوية', keys: ['التصميم', 'الشعار', 'السبلاش', 'الخلفية', 'وصف الموقع', 'اسم الموقع'] },
      { id: 'settings', icon: 'settings', title: 'الإعدادات العامة', desc: 'إعدادات التطبيق', keys: ['الإعدادات', 'عام', 'الموقع'] },
    ];

    const home = document.createElement('div');
    home.className = 'admin-sections-home';
    home.innerHTML = cards.map(card => `
      <button type="button" class="admin-section-card" data-open-admin-section="${card.id}">
        <i data-lucide="${card.icon}"></i>
        <strong>${card.title}</strong>
        <span>${card.desc}</span>
      </button>
    `).join('');

    const titleBox = title.closest('.card, .page-header, .section-header, div') || title;
    titleBox.insertAdjacentElement('afterend', home);

    const children = Array.from(adminRoot.children).filter(el => {
      if (el === home || el.contains(home) || el === titleBox) return false;
      return el.offsetParent !== null || el.querySelector('form,button,input,h2,h3,strong');
    });

    children.forEach(el => {
      const text = (el.textContent || '').trim();
      if (!text) return;
      let matched = cards.find(card => card.keys.some(key => text.includes(key)));
      if (!matched) matched = cards.find(card => card.id === 'settings');
      el.classList.add('admin-managed-section', 'is-hidden');
      el.dataset.adminSection = matched.id;
    });

    function showHome() {
      home.classList.remove('is-hidden');
      document.querySelectorAll('.admin-managed-section').forEach(el => el.classList.add('is-hidden'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (window.lucide) window.lucide.createIcons();
    }

    function showSection(id) {
      home.classList.add('is-hidden');
      document.querySelectorAll('.admin-managed-section').forEach(el => {
        el.classList.toggle('is-hidden', el.dataset.adminSection !== id);
      });

      const first = document.querySelector(`.admin-managed-section[data-admin-section="${id}"]`);
      if (first && !first.querySelector('.admin-section-back')) {
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'btn admin-section-back';
        back.textContent = 'الرجوع للوحة التحكم';
        back.addEventListener('click', showHome);
        first.insertAdjacentElement('afterbegin', back);
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (window.lucide) window.lucide.createIcons();
    }

    home.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-open-admin-section]');
      if (!btn) return;
      showSection(btn.dataset.openAdminSection);
    });

    showHome();
    if (window.lucide) window.lucide.createIcons();
  }

  document.addEventListener('DOMContentLoaded', setupAdminSections);
  window.addEventListener('hashchange', () => setTimeout(setupAdminSections, 150));
  setTimeout(setupAdminSections, 500);
})();
'''
    js.write_text(js_text, encoding="utf-8")

print("تم ترتيب لوحة التحكم إلى أقسام. تم أخذ نسخة احتياطية للملفات.")
