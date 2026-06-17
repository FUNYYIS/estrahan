from pathlib import Path

html = Path("pages/admin-notifications.html")
css = Path("assets/css/main.css")
js = Path("assets/js/main.js")

for p in [html, css, js]:
    if not p.exists():
        raise SystemExit(f"Missing file: {p}")

marker = "ESTRAHA_DESIGN_CONTROLS_V1"

# backups
for p in [html, css, js]:
    b = p.with_suffix(p.suffix + ".backup-design-controls")
    if not b.exists():
        b.write_text(p.read_text(encoding="utf-8"), encoding="utf-8")

html_text = html.read_text(encoding="utf-8")
css_text = css.read_text(encoding="utf-8")
js_text = js.read_text(encoding="utf-8")

# CSS
if marker not in css_text:
    css_text += f"""

/* {marker} */
:root {{
  --estraha-primary: #166534;
  --estraha-header: #0f172a;
  --estraha-button: #15803d;
  --estraha-card: #ffffff;
  --estraha-text: #1f2937;
  --estraha-title-font: 'Tajawal', sans-serif;
  --estraha-body-font: 'Tajawal', sans-serif;
}}

body {{
  color: var(--estraha-text);
  font-family: var(--estraha-body-font);
}}

h1, h2, h3, .font-bold, strong {{
  font-family: var(--estraha-title-font);
}}

.btn,
button.btn {{
  background: var(--estraha-button);
}}

.card,
.admin-extra-section,
.admin-control-card,
.reference-card,
.glass-card {{
  background: var(--estraha-card);
  color: var(--estraha-text);
}}

.app-header,
.header,
.topbar,
.navbar {{
  background: var(--estraha-header);
}}

.design-control-preview {{
  margin-top: 16px;
  padding: 16px;
  border-radius: 22px;
  background: var(--estraha-card);
  color: var(--estraha-text);
  border: 1px solid rgba(15,23,42,.08);
}}

.design-preview-button {{
  display: inline-flex;
  padding: 10px 16px;
  border-radius: 14px;
  margin-top: 10px;
  background: var(--estraha-button);
  color: white;
  font-weight: 700;
}}
"""
    css.write_text(css_text, encoding="utf-8")

# JS
if marker not in js_text:
    js_text += f"""

/* {marker} */
(function () {{
  const DESIGN_KEY = 'estraha_design_settings_v1';

  const defaults = {{
    primaryColor: '#166534',
    headerColor: '#0f172a',
    buttonColor: '#15803d',
    cardColor: '#ffffff',
    textColor: '#1f2937',
    titleFont: 'Tajawal',
    bodyFont: 'Tajawal'
  }};

  const fontMap = {{
    'Tajawal': "'Tajawal', sans-serif",
    'Cairo': "'Cairo', sans-serif",
    'IBM Plex Sans Arabic': "'IBM Plex Sans Arabic', sans-serif",
    'Noto Kufi Arabic': "'Noto Kufi Arabic', sans-serif",
    'Almarai': "'Almarai', sans-serif"
  }};

  function loadDesign() {{
    try {{
      return {{ ...defaults, ...JSON.parse(localStorage.getItem(DESIGN_KEY) || '{{}}') }};
    }} catch (e) {{
      return defaults;
    }}
  }}

  function saveDesign(data) {{
    localStorage.setItem(DESIGN_KEY, JSON.stringify(data));
  }}

  function applyDesign(data = loadDesign()) {{
    const root = document.documentElement;
    root.style.setProperty('--estraha-primary', data.primaryColor || defaults.primaryColor);
    root.style.setProperty('--estraha-header', data.headerColor || defaults.headerColor);
    root.style.setProperty('--estraha-button', data.buttonColor || defaults.buttonColor);
    root.style.setProperty('--estraha-card', data.cardColor || defaults.cardColor);
    root.style.setProperty('--estraha-text', data.textColor || defaults.textColor);
    root.style.setProperty('--estraha-title-font', fontMap[data.titleFont] || fontMap.Tajawal);
    root.style.setProperty('--estraha-body-font', fontMap[data.bodyFont] || fontMap.Tajawal);
  }}

  function field(id) {{
    return document.getElementById(id);
  }}

  function fillFields() {{
    const d = loadDesign();
    const map = {{
      'design-primary-color': d.primaryColor,
      'design-header-color': d.headerColor,
      'design-button-color': d.buttonColor,
      'design-card-color': d.cardColor,
      'design-text-color': d.textColor,
      'design-title-font': d.titleFont,
      'design-body-font': d.bodyFont
    }};
    Object.entries(map).forEach(([id, value]) => {{
      const el = field(id);
      if (el) el.value = value;
    }});
  }}

  function collectFields() {{
    return {{
      primaryColor: field('design-primary-color')?.value || defaults.primaryColor,
      headerColor: field('design-header-color')?.value || defaults.headerColor,
      buttonColor: field('design-button-color')?.value || defaults.buttonColor,
      cardColor: field('design-card-color')?.value || defaults.cardColor,
      textColor: field('design-text-color')?.value || defaults.textColor,
      titleFont: field('design-title-font')?.value || defaults.titleFont,
      bodyFont: field('design-body-font')?.value || defaults.bodyFont
    }};
  }}

  function addDesignControls() {{
    if (!location.hash.includes('admin-notifications')) return;
    if (document.getElementById('estraha-design-controls')) return;

    const designSection =
      document.querySelector('[data-admin-section="design"]') ||
      Array.from(document.querySelectorAll('section, .card, .admin-extra-section')).find(el =>
        (el.textContent || '').includes('إدارة التصميم') ||
        (el.textContent || '').includes('الشعار') ||
        (el.textContent || '').includes('السبلاش')
      );

    if (!designSection) return;

    const box = document.createElement('div');
    box.id = 'estraha-design-controls';
    box.className = 'admin-extra-section';
    box.innerHTML = `
      <h2><i data-lucide="palette"></i> إدارة الألوان والخطوط</h2>
      <p class="text-sm">غيّر ألوان التطبيق وخطوطه وشوف المعاينة مباشرة.</p>

      <div class="admin-extra-grid">
        <label class="admin-extra-field">
          <span>اللون الرئيسي</span>
          <input id="design-primary-color" type="color">
        </label>

        <label class="admin-extra-field">
          <span>لون الهيدر</span>
          <input id="design-header-color" type="color">
        </label>

        <label class="admin-extra-field">
          <span>لون الأزرار</span>
          <input id="design-button-color" type="color">
        </label>

        <label class="admin-extra-field">
          <span>لون البطاقات</span>
          <input id="design-card-color" type="color">
        </label>

        <label class="admin-extra-field">
          <span>لون النصوص</span>
          <input id="design-text-color" type="color">
        </label>

        <label class="admin-extra-field">
          <span>خط العناوين</span>
          <select id="design-title-font">
            <option value="Tajawal">Tajawal</option>
            <option value="Cairo">Cairo</option>
            <option value="IBM Plex Sans Arabic">IBM Plex Sans Arabic</option>
            <option value="Noto Kufi Arabic">Noto Kufi Arabic</option>
            <option value="Almarai">Almarai</option>
          </select>
        </label>

        <label class="admin-extra-field">
          <span>خط التطبيق</span>
          <select id="design-body-font">
            <option value="Tajawal">Tajawal</option>
            <option value="Cairo">Cairo</option>
            <option value="IBM Plex Sans Arabic">IBM Plex Sans Arabic</option>
            <option value="Noto Kufi Arabic">Noto Kufi Arabic</option>
            <option value="Almarai">Almarai</option>
          </select>
        </label>
      </div>

      <div class="design-control-preview">
        <strong>معاينة مباشرة</strong>
        <p>هذا مثال على النص داخل بطاقة من تطبيق الاستراحة.</p>
        <span class="design-preview-button">زر تجريبي</span>
      </div>

      <div class="admin-extra-grid">
        <button type="button" class="btn" id="save-design-controls">حفظ التصميم</button>
        <button type="button" class="btn secondary" id="reset-design-controls">استعادة الافتراضي</button>
      </div>
    `;

    designSection.appendChild(box);
    fillFields();
    applyDesign();

    box.addEventListener('input', () => applyDesign(collectFields()));
    box.addEventListener('change', () => applyDesign(collectFields()));

    document.getElementById('save-design-controls')?.addEventListener('click', () => {{
      const data = collectFields();
      saveDesign(data);
      applyDesign(data);
      if (typeof showAlert === 'function') showAlert('تم حفظ إعدادات التصميم.');
      else alert('تم حفظ إعدادات التصميم.');
    }});

    document.getElementById('reset-design-controls')?.addEventListener('click', () => {{
      saveDesign(defaults);
      fillFields();
      applyDesign(defaults);
      if (typeof showAlert === 'function') showAlert('تمت استعادة الألوان الافتراضية.');
      else alert('تمت استعادة الألوان الافتراضية.');
    }});

    if (window.lucide) window.lucide.createIcons();
  }}

  applyDesign();
  document.addEventListener('DOMContentLoaded', () => {{
    applyDesign();
    setTimeout(addDesignControls, 700);
  }});
  window.addEventListener('hashchange', () => {{
    applyDesign();
    setTimeout(addDesignControls, 700);
  }});
}})();
"""
    js.write_text(js_text, encoding="utf-8")

print("تمت إضافة إدارة الألوان والخطوط ✅")
