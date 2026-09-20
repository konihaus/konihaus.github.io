/*
 * packages-render.js
 * Builds the <li> items of every package card from the language JSON, so
 * adding, removing or reordering features only means editing the JSON.
 *
 * HTML  : <ul class="pkg__list pkg-1"></ul>      pkg-<N> = card position (1 = first card); keep the list empty
 * JSON  : "packages": { "<audience>_pkg<N>_features": ["Item 1", "Item 2", ...] }
 *         audiences: basis | senioren | mieter | ferienhaus
 *
 * Usage
 *   A) Automatic (default): include the script and it does everything itself
 *        <script src="packages-render.js" defer></script>
 *      It re-renders on page load, on audience tab click (.pkg-tab[data-audience])
 *      and on language change (.lang-selector).
 *
 *   B) Manual: if your own i18n code already holds the loaded JSON, add data-manual
 *        <script src="packages-render.js" data-manual defer></script>
 *      and call, wherever you switch language or audience:
 *        PackageLists.render(translations.packages, audience);
 */
(function () {
  'use strict';

  // ── Config: adjust if your setup differs ───────────────────────────────────
  const JSON_URL         = (lang) => './translations/' + lang + '.json'; // where the language files live
  const DEFAULT_LANG     = 'de';
  const DEFAULT_AUDIENCE = 'basis';
  // ───────────────────────────────────────────────────────────────────────────

  const manual = !!(document.currentScript && document.currentScript.hasAttribute('data-manual'));

  // "pkg__list pkg-2"  ->  "2"
  function tierOf(ul) {
    const cls = Array.from(ul.classList).find((c) => /^pkg-\d+$/.test(c));
    return cls ? cls.slice(4) : null;
  }

  function buildItem(text) {
    const li = document.createElement('li');

    const chk = document.createElement('span');
    chk.className = 'chk';
    chk.setAttribute('aria-hidden', 'true');
    chk.textContent = '✓';

    const label = document.createElement('span');
    label.textContent = text; // textContent, never innerHTML: JSON text is not parsed as HTML

    li.append(chk, label);
    return li;
  }

  /** Fill every .pkg__list from pkgTexts (= the "packages" object of the language JSON). */
  function render(pkgTexts, audience) {
    document.querySelectorAll('.pkg__list').forEach((ul) => {
      const tier = tierOf(ul);
      if (tier === null) return;

      const key = audience + '_pkg' + tier + '_features';
      const items = pkgTexts && pkgTexts[key];

      if (!Array.isArray(items)) {
        console.warn('[PackageLists] missing array "' + key + '" in the language JSON');
        ul.replaceChildren();
        return;
      }
      ul.replaceChildren(...items.map(buildItem));
    });
  }

  // ── Automatic mode ─────────────────────────────────────────────────────────
  const cache = {};
  let latest = 0;

  function loadTexts(lang) {
    if (!cache[lang]) {
      cache[lang] = fetch(JSON_URL(lang))
        .then((res) => {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then((json) => json.packages)
        .catch((err) => { delete cache[lang]; throw err; });
    }
    return cache[lang];
  }

  function currentLang() {
    const sel = document.querySelector('.lang-selector');
    return String((sel && sel.value) || document.documentElement.lang || DEFAULT_LANG).toLowerCase();
  }

  function currentAudience() {
    const tab = document.querySelector('.pkg-tab.active');
    return (tab && tab.dataset.audience) || DEFAULT_AUDIENCE;
  }

  function refresh(opts) {
    opts = opts || {};
    const lang = (opts.lang || currentLang()).toLowerCase();
    const audience = opts.audience || currentAudience();
    const ticket = ++latest; // ignore results of superseded requests

    return loadTexts(lang)
      .then((texts) => { if (ticket === latest) render(texts, audience); })
      .catch((err) => console.warn('[PackageLists] could not load "' + lang + '" (' + err.message + ')'));
  }

  function init() {
    refresh();

    document.querySelectorAll('.pkg-tab').forEach((tab) => {
      tab.addEventListener('click', () => refresh({ audience: tab.dataset.audience }));
    });

    const sel = document.querySelector('.lang-selector');
    if (sel) sel.addEventListener('change', () => refresh({ lang: sel.value }));

    // Your own code may set the initial language after DOMContentLoaded.
    window.addEventListener('load', () => refresh());
  }

  window.PackageLists = { render, refresh, init };

  if (!manual) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})();
