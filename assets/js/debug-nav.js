/* Debug nav panel — only loaded when ?debugNav=1 is in the URL. No effect on production. */
(function () {
  const panel = document.createElement('div');
  panel.id = 'debug-nav-panel';
  Object.assign(panel.style, {
    position: 'fixed',
    bottom: '130px',
    left: '8px',
    right: '8px',
    zIndex: '99999',
    background: 'rgba(0,0,0,0.88)',
    color: '#7fff7f',
    fontFamily: 'monospace',
    fontSize: '11px',
    lineHeight: '1.55',
    padding: '8px 10px',
    borderRadius: '12px',
    pointerEvents: 'none',
    maxHeight: '200px',
    overflowY: 'hidden',
    boxSizing: 'border-box',
    wordBreak: 'break-all',
  });

  const rows = { status: 'ready — waiting for tap' };

  function render() {
    panel.innerHTML = Object.entries(rows)
      .map(([k, v]) => `<span style="color:#aaa">${k}:</span> ${String(v).replace(/</g, '&lt;')}`)
      .join('<br>');
  }

  function mount() {
    if (document.body && !document.getElementById('debug-nav-panel')) {
      document.body.appendChild(panel);
    }
  }
  if (document.body) { mount(); } else { document.addEventListener('DOMContentLoaded', mount); }

  function describeEl(el) {
    if (!el || el === document) return '(document)';
    if (el === window) return '(window)';
    const tag = el.tagName ? el.tagName.toLowerCase() : '?';
    const id = el.id ? '#' + el.id : '';
    const cls = el.classList ? [...el.classList].slice(0, 3).map(c => '.' + c).join('') : '';
    return tag + id + cls;
  }

  function closestNavLink(el) {
    if (!el || typeof el.closest !== 'function') return null;
    return el.closest('.nav-link');
  }

  function fromPointDesc(x, y) {
    try { return describeEl(document.elementFromPoint(x, y)); } catch (_) { return '?'; }
  }

  // --- touchstart / touchend ---
  document.addEventListener('touchstart', function (e) {
    const t = e.touches[0] || e.changedTouches[0];
    if (!t) return;
    const x = Math.round(t.clientX), y = Math.round(t.clientY);
    const nl = closestNavLink(e.target);
    delete rows.status;
    rows.touchstart = '(' + x + ',' + y + ')';
    rows.ts_target = describeEl(e.target);
    rows.ts_navLink = nl ? (nl.getAttribute('href') || '(no href)') : 'none';
    rows.ts_fromPoint = fromPointDesc(t.clientX, t.clientY);
    rows.hash = location.hash || '(empty)';
    render();
  }, { passive: true, capture: true });

  document.addEventListener('touchend', function (e) {
    const t = e.changedTouches[0];
    if (!t) return;
    rows.touchend = '(' + Math.round(t.clientX) + ',' + Math.round(t.clientY) + ')';
    render();
  }, { passive: true, capture: true });

  // --- pointerdown ---
  document.addEventListener('pointerdown', function (e) {
    const x = Math.round(e.clientX), y = Math.round(e.clientY);
    const nl = closestNavLink(e.target);
    delete rows.status;
    rows.pointerdown = '(' + x + ',' + y + ')';
    rows.pd_target = describeEl(e.target);
    rows.pd_navLink = nl ? (nl.getAttribute('href') || '(no href)') : 'none';
    rows.pd_fromPoint = fromPointDesc(e.clientX, e.clientY);
    render();
  }, { passive: true, capture: true });

  // --- click ---
  document.addEventListener('click', function (e) {
    const nl = closestNavLink(e.target);
    rows.click = '(' + Math.round(e.clientX) + ',' + Math.round(e.clientY) + ')';
    rows.ck_target = describeEl(e.target);
    rows.ck_navLink = nl ? (nl.getAttribute('href') || '(no href)') : 'none';
    rows.ck_prevented = e.defaultPrevented ? 'YES' : 'no';
    rows.hash = location.hash || '(empty)';
    render();
  }, { capture: true });

  // --- hashchange ---
  window.addEventListener('hashchange', function () {
    rows.hash = location.hash || '(empty)';
    rows.hashChanged = new Date().toLocaleTimeString();
    render();
  });

  // --- per-nav listeners ---
  function bindNav(nav) {
    if (nav._dbgBound) return;
    nav._dbgBound = true;

    nav.addEventListener('click', function (e) {
      const nl = closestNavLink(e.target);
      rows.nav_click = describeEl(e.target);
      rows.nav_navLink = nl ? (nl.getAttribute('href') || '(no href)') : 'none';
      render();
    }, { capture: true });

    nav.querySelectorAll('.nav-link').forEach(function (link) {
      link.addEventListener('click', function (e) {
        rows.link_click = link.getAttribute('href') || '(no href)';
        rows.link_prevented = e.defaultPrevented ? 'YES' : 'no';
        render();
      }, { capture: true });
    });
  }

  var navEl = document.getElementById('bottom-nav');
  if (navEl) { bindNav(navEl); }

  new MutationObserver(function () {
    var el = document.getElementById('bottom-nav');
    if (el) { bindNav(el); }
  }).observe(document.documentElement, { childList: true, subtree: true });

  render();
})();
