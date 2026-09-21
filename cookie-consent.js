/*
 * cookie-consent.js
 * Cookie banner + declaration/settings dialog + consent-gated Google Analytics.
 *
 *  - Nothing from Google is loaded and no analytics cookie is set until the visitor allows "statistics".
 *  - "Allow all", "Necessary only" and "Save selection" are equally easy to reach; the choice can be changed
 *    or withdrawn at any time via the footer link (data-cc-open) or the URL hash #cookie-declaration.
 *  - The choice is stored in localStorage ("konihaus_consent"), is valid for 12 months and is asked again when
 *    CONSENT_VERSION changes.
 *  - All texts come from the language JSON, section "cookies" (see translations/*.json).
 *
 * Adding a tracker / cookie later:
 *  1. add it to ITEMS below (and a category to CATEGORIES if it is a new one),
 *  2. add cookies.purpose_<id> (and cat_<category>_title / _desc for a new category) to every language file,
 *  3. load it only when cookieConsent.hasConsent('<category>') is true (listen to "cookieconsent:change"),
 *  4. raise CONSENT_VERSION so returning visitors are asked again.
 *
 * Integration: scripts.js calls cookieConsent.init() once the translations are loaded and
 * cookieConsent.refresh() whenever the language changes.
 */
(function () {
  'use strict';

  // ── Configuration ──────────────────────────────────────────────────────────
  const GA_ID = 'G-0VZ3EBY1JT';
  const STORAGE_KEY = 'konihaus_consent';
  const CONSENT_VERSION = 1;
  const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 12 months
  const DECLARATION_HASH = '#cookie-declaration';
  const LOCALES = { de: 'de-CH', en: 'en-GB', fr: 'fr-CH', it: 'it-CH' };

  const CATEGORIES = [
    { id: 'necessary', locked: true },
    { id: 'statistics', locked: false },
  ];

  // Everything the site stores on a visitor's device.
  // Texts: cookies.purpose_<id>, cookies.dur_<duration>, cookies.type_<type>
  const ITEMS = [
    { id: 'consent', category: 'necessary', name: STORAGE_KEY, provider: 'konihaus.ch', type: 'local', duration: '12m' },
    { id: 'lang', category: 'necessary', name: 'lang', provider: 'konihaus.ch', type: 'local', duration: 'persist' },
    { id: 'cache', category: 'necessary', name: 'konihaus-v1', provider: 'konihaus.ch', type: 'cache', duration: 'persist' },
    { id: 'ga', category: 'statistics', name: '_ga', provider: 'Google', type: 'cookie', duration: '2y' },
    { id: 'ga_measurement', category: 'statistics', name: '_ga_' + GA_ID.replace('G-', ''), provider: 'Google', type: 'cookie', duration: '2y' },
  ];
  // ───────────────────────────────────────────────────────────────────────────

  const state = {
    inited: false,
    consent: null,              // { v, ts, choices: { statistics: bool } } or null (= no valid decision yet)
    draft: { statistics: false }, // toggle state inside the dialog
    banner: null,
    overlay: null,
    lastFocus: null,
  };

  // ── Texts ──────────────────────────────────────────────────────────────────
  function texts() {
    if (typeof i18n === 'undefined') return {};
    const tr = i18n.translations || {};
    const current = tr[i18n.currentLang] && tr[i18n.currentLang].cookies;
    return current || (tr.de && tr.de.cookies) || {};
  }
  function tx(key) {
    const value = texts()[key];
    return typeof value === 'string' ? value : '';
  }
  function locale() {
    return LOCALES[typeof i18n !== 'undefined' ? i18n.currentLang : 'de'] || 'de-CH';
  }

  // ── Small DOM helper (text is always set via textContent, never parsed as HTML) ──
  function el(tag, props) {
    const node = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (v === false || v == null) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v === true ? '' : v);
    });
    for (let i = 2; i < arguments.length; i++) {
      [arguments[i]].flat(Infinity).forEach((child) => { if (child != null) node.append(child); });
    }
    return node;
  }

  // ── Stored decision ────────────────────────────────────────────────────────
  function readConsent() {
    try {
      const c = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!c || c.v !== CONSENT_VERSION || typeof c.ts !== 'number' || !c.choices) return null;
      if (Date.now() - c.ts > MAX_AGE_MS) return null;
      return c;
    } catch (e) {
      return null;
    }
  }
  function writeConsent(choices) {
    const c = { v: CONSENT_VERSION, ts: Date.now(), choices: { statistics: !!choices.statistics } };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch (e) { /* storage blocked: decision lives for this page view only */ }
    return c;
  }
  function hasConsent(category) {
    if (category === 'necessary') return true;
    return !!(state.consent && state.consent.choices[category]);
  }

  // ── Google Analytics (only after consent) ──────────────────────────────────
  function loadAnalytics() {
    window['ga-disable-' + GA_ID] = false;
    if (window.__khAnalyticsLoaded) return;
    window.__khAnalyticsLoaded = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    // Statistics only: no advertising storage, no Google signals.
    window.gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { allow_google_signals: false, allow_ad_personalization_signals: false });

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(script);
  }

  function deleteAnalyticsCookies() {
    const names = document.cookie.split(';')
      .map((c) => c.split('=')[0].trim())
      .filter((n) => n === '_ga' || n === '_gid' || n.indexOf('_ga_') === 0 || n.indexOf('_gat') === 0);
    if (!names.length) return;

    const host = location.hostname;
    const parts = host.split('.');
    const domains = ['', host, '.' + host];
    for (let i = 1; i < parts.length - 1; i++) domains.push('.' + parts.slice(i).join('.'));

    names.forEach((name) => domains.forEach((domain) => {
      document.cookie = name + '=; Max-Age=0; path=/' + (domain ? '; domain=' + domain : '');
    }));
  }

  function stopAnalytics() {
    window['ga-disable-' + GA_ID] = true; // makes an already loaded gtag.js stop measuring
    deleteAnalyticsCookies();
  }

  function applyConsent() {
    if (hasConsent('statistics')) loadAnalytics();
    else stopAnalytics();
  }

  // ── Banner ─────────────────────────────────────────────────────────────────
  function buildBanner() {
    return el('div', { class: 'cc-banner', id: 'cc-banner', role: 'region', 'aria-labelledby': 'cc-banner-title', hidden: !!state.consent },
      el('h2', { class: 'cc-banner__title', id: 'cc-banner-title', text: tx('banner_title') }),
      el('p', { class: 'cc-banner__text', text: tx('banner_text') }),
      el('div', { class: 'cc-banner__actions' },
        el('button', { type: 'button', class: 'cc-btn cc-btn--primary', 'data-cc': 'accept-all', text: tx('btn_accept_all') }),
        el('button', { type: 'button', class: 'cc-btn cc-btn--secondary', 'data-cc': 'reject', text: tx('btn_reject') })),
      el('div', { class: 'cc-banner__links' },
        el('button', { type: 'button', class: 'cc-link', 'data-cc': 'customize', text: tx('btn_customize') }),
        el('button', { type: 'button', class: 'cc-link', 'data-cc': 'details', text: tx('btn_details') })));
  }

  // ── Dialog (declaration + settings) ────────────────────────────────────────
  function privacyHref() {
    const link = document.querySelector('[data-legal="privacy"]');
    const href = link && link.getAttribute('href');
    return href && href !== '#' ? href : null;
  }

  function privacyParagraph() {
    const pieces = tx('about_privacy').split('{link}');
    const label = tx('privacy_link_text');
    const href = privacyHref();
    return el('p', {}, pieces[0], href ? el('a', { href: href }, label) : label, pieces[1] || '');
  }

  function statusText() {
    if (!state.consent) return tx('not_saved');
    const date = new Date(state.consent.ts).toLocaleDateString(locale());
    return tx('saved_on').replace('{date}', date);
  }

  function buildCategory(cat) {
    const input = el('input', { type: 'checkbox', role: 'switch', id: 'cc-cat-' + cat.id, 'data-cc-cat': cat.id, 'aria-label': tx('cat_' + cat.id + '_title') });
    input.checked = cat.locked || !!state.draft[cat.id];
    input.disabled = cat.locked;
    return el('div', { class: 'cc-cat' },
      el('div', { class: 'cc-cat__head' },
        el('h4', { class: 'cc-cat__title', text: tx('cat_' + cat.id + '_title') }),
        el('label', { class: 'cc-switch', for: 'cc-cat-' + cat.id },
          input,
          el('span', { class: 'cc-switch__ui', 'aria-hidden': 'true' }),
          cat.locked ? el('span', { class: 'cc-switch__label', text: tx('cat_always_on') }) : null)),
      el('p', { class: 'cc-cat__desc', text: tx('cat_' + cat.id + '_desc') }));
  }

  function buildTable(categoryId) {
    const cols = ['name', 'provider', 'purpose', 'duration', 'type'];
    const rows = ITEMS.filter((item) => item.category === categoryId);
    return el('div', { class: 'cc-tablewrap' },
      el('table', { class: 'cc-table' },
        el('thead', {}, el('tr', {}, cols.map((c) => el('th', { scope: 'col', text: tx('col_' + c) })))),
        el('tbody', {}, rows.map((r) => el('tr', {},
          el('td', { 'data-label': tx('col_name') }, el('code', { text: r.name })),
          el('td', { 'data-label': tx('col_provider'), text: r.provider }),
          el('td', { 'data-label': tx('col_purpose'), text: tx('purpose_' + r.id) }),
          el('td', { 'data-label': tx('col_duration'), text: tx('dur_' + r.duration) }),
          el('td', { 'data-label': tx('col_type'), text: tx('type_' + r.type) }))))));
  }

  function buildDialog() {
    return el('div', { class: 'cc-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cc-dialog-title', tabindex: '-1' },
      el('div', { class: 'cc-dialog__head' },
        el('h2', { class: 'cc-dialog__title', id: 'cc-dialog-title', text: tx('dialog_title') }),
        el('button', { type: 'button', class: 'cc-close', 'data-cc': 'close', 'aria-label': tx('dialog_close'), text: '×' })),

      el('div', { class: 'cc-dialog__body' },
        el('section', { class: 'cc-sec', id: 'cc-choice' },
          el('h3', { text: tx('consent_title') }),
          el('p', { class: 'cc-status', text: statusText() }),
          CATEGORIES.map(buildCategory),
          el('p', { class: 'cc-unused', text: tx('cat_unused') })),

        el('section', { class: 'cc-sec', id: 'cc-list' },
          el('h3', { text: tx('list_title') }),
          CATEGORIES.map((cat) => [
            el('h4', { class: 'cc-list__cat', text: tx('cat_' + cat.id + '_title') }),
            buildTable(cat.id),
          ]),
          el('h4', { class: 'cc-list__cat', text: tx('fonts_title') }),
          el('p', { class: 'cc-fonts', text: tx('fonts_text') })),

        el('section', { class: 'cc-sec', id: 'cc-about' },
          el('h3', { text: tx('about_title') }),
          el('p', { text: tx('about_p1') }),
          el('p', { text: tx('about_p2') }),
          el('p', { text: tx('about_p3') }),
          el('p', { text: tx('about_p4') }),
          privacyParagraph(),
          el('p', { class: 'cc-domain', text: tx('domain_line') }))),

      el('div', { class: 'cc-dialog__foot' },
        el('button', { type: 'button', class: 'cc-btn cc-btn--primary', 'data-cc': 'save', text: tx('btn_save') }),
        el('button', { type: 'button', class: 'cc-btn cc-btn--secondary', 'data-cc': 'accept-all', text: tx('btn_accept_all') }),
        el('button', { type: 'button', class: 'cc-btn cc-btn--secondary', 'data-cc': 'reject', text: tx('btn_reject') })));
  }

  // ── Open / close ───────────────────────────────────────────────────────────
  function dialogOpen() {
    return !!state.overlay && !state.overlay.hidden;
  }

  function openDialog(opts) {
    opts = opts || {};
    state.lastFocus = opts.from || document.activeElement;
    state.draft = { statistics: hasConsent('statistics') };
    state.overlay.replaceChildren(buildDialog());
    state.overlay.hidden = false;
    document.documentElement.classList.add('cc-lock');
    document.body.classList.add('cc-lock');

    const dialog = state.overlay.firstElementChild;
    dialog.focus();
    if (opts.scrollTo) {
      const target = document.getElementById(opts.scrollTo);
      if (target) target.scrollIntoView({ block: 'start' });
    }
  }

  function closeDialog() {
    if (!dialogOpen()) return;
    state.overlay.hidden = true;
    document.documentElement.classList.remove('cc-lock');
    document.body.classList.remove('cc-lock');
    if (location.hash === DECLARATION_HASH) {
      history.replaceState(null, '', location.pathname + location.search);
    }
    const back = state.lastFocus;
    if (back && document.contains(back) && typeof back.focus === 'function') back.focus();
  }

  function trapFocus(e) {
    const dialog = state.overlay.firstElementChild;
    const focusable = Array.from(dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled])'))
      .filter((n) => n.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  // ── Decisions ──────────────────────────────────────────────────────────────
  function decide(choices) {
    state.consent = writeConsent(choices);
    state.draft = { statistics: !!state.consent.choices.statistics };
    applyConsent();
    state.banner.hidden = true;
    closeDialog();
    document.dispatchEvent(new CustomEvent('cookieconsent:change', { detail: state.consent.choices }));
  }

  function handleAction(action) {
    switch (action) {
      case 'accept-all': decide({ statistics: true }); break;
      case 'reject': decide({ statistics: false }); break;
      case 'save': decide(state.draft); break;
      case 'customize': openDialog({ from: document.activeElement }); break;
      case 'details': openDialog({ from: document.activeElement, scrollTo: 'cc-list' }); break;
      case 'close': closeDialog(); break;
      default: break;
    }
  }

  function bindEvents() {
    document.addEventListener('click', (e) => {
      const action = e.target.closest && e.target.closest('[data-cc]');
      if (action) { handleAction(action.getAttribute('data-cc')); return; }

      const opener = e.target.closest && e.target.closest('[data-cc-open]');
      if (opener) { e.preventDefault(); openDialog({ from: opener }); return; }

      if (e.target === state.overlay) closeDialog(); // click on the backdrop
    });

    document.addEventListener('change', (e) => {
      const toggle = e.target.closest && e.target.closest('[data-cc-cat]');
      if (toggle) state.draft[toggle.getAttribute('data-cc-cat')] = toggle.checked;
    });

    document.addEventListener('keydown', (e) => {
      if (!dialogOpen()) return;
      if (e.key === 'Escape') { e.preventDefault(); closeDialog(); }
      else if (e.key === 'Tab') trapFocus(e);
    });

    window.addEventListener('hashchange', () => {
      if (location.hash === DECLARATION_HASH) openDialog({ scrollTo: 'cc-list' });
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  function init() {
    if (state.inited) return;
    state.inited = true;

    state.consent = readConsent();
    state.draft = { statistics: hasConsent('statistics') };
    applyConsent(); // also removes analytics cookies left over from before the banner existed

    state.banner = buildBanner();
    state.overlay = el('div', { class: 'cc-overlay', id: 'cc-overlay', hidden: true });
    document.body.prepend(state.banner);
    document.body.append(state.overlay);
    bindEvents();

    if (location.hash === DECLARATION_HASH) openDialog({ scrollTo: 'cc-list' });
  }

  /** Re-render all texts, e.g. after a language change. */
  function refresh() {
    if (!state.inited) return;
    const next = buildBanner();
    state.banner.replaceWith(next);
    state.banner = next;
    if (dialogOpen()) {
      const body = state.overlay.querySelector('.cc-dialog__body');
      const scroll = body ? body.scrollTop : 0;
      state.overlay.replaceChildren(buildDialog());
      const fresh = state.overlay.querySelector('.cc-dialog__body');
      if (fresh) fresh.scrollTop = scroll;
      state.overlay.firstElementChild.focus();
    }
  }

  window.cookieConsent = { init, refresh, open: openDialog, hasConsent };
})();
