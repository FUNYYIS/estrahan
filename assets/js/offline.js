import './runtime-ux.js';

document.querySelectorAll('[data-last-updated-key]').forEach((element) => {
  const key = element.dataset.lastUpdatedKey;
  window.EstrahaFreshness?.render(element, key, { cached: true });
});
