const LANG_COOKIE = 'konihaus-language';

function getCookie(name) {
  try {
    const escaped = name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1');
    const match = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function setCookie(name, value, days = 365) {
  try {
    const host = window.location.hostname;
    const domainAttr = host.endsWith('konihaus.ch') ? '; domain=.konihaus.ch' : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${days * 24 * 60 * 60}${domainAttr}; SameSite=Lax`;
  } catch {
    
  }
}

function getLangFromPath() {
  const path = window.location.pathname;
  if (path.startsWith('/de/')) return 'de';
  if (path.startsWith('/en/')) return 'en';
  return null;
}

/* Pages that exist once per language under their own URL (e.g. /home-assistant-schweiz and
   /home-assistant-switzerland) declare both URLs on <body>:
     <body data-alt-de="/home-assistant-schweiz" data-alt-en="/home-assistant-switzerland">
   The URL then decides the language: opening one of the pages sets the language (cookie + localStorage),
   and the language picker jumps to the other page instead of swapping text in place. */
function getLangPages() {
  const b = document.body;
  if (!b || (!b.dataset.altDe && !b.dataset.altEn)) return null;
  return { de: b.dataset.altDe, en: b.dataset.altEn };
}

function normalizePath(path) {
  return (path || '').replace(/index\.html$/, '').replace(/\.html$/, '').replace(/\/+$/, '') || '/';
}

function getPageLang() {
  const pages = getLangPages();
  if (!pages) return null;
  const here = normalizePath(window.location.pathname);
  for (const lang of ['de', 'en']) {
    if (pages[lang] && normalizePath(pages[lang]) === here) return lang;
  }
  return null;
}

function persistLanguage(lang) {
  try {
    localStorage.setItem('lang', lang);
    localStorage.setItem(LANG_COOKIE, lang);
  } catch { /* storage blocked */ }
  setCookie(LANG_COOKIE, lang);
}

/* ───────── READABILITY (Aa button): text size · high contrast · pause animations ─────────
   Preference lives in localStorage only ("konihaus-readability"), never leaves the device.
   <head> has a tiny inline copy of applyReadability() so the size is right before first paint. */
const READABILITY_KEY = 'konihaus-readability';
const READABILITY_DEFAULT = { text: 'normal', contrast: false, motion: null }; // motion: null = follow the OS setting

function readReadability() {
  try {
    const p = JSON.parse(localStorage.getItem(READABILITY_KEY) || '{}');
    return {
      text: p.text === 'large' || p.text === 'xl' ? p.text : 'normal',
      contrast: p.contrast === true,
      motion: typeof p.motion === 'boolean' ? p.motion : null,
    };
  } catch {
    return { ...READABILITY_DEFAULT };
  }
}

function writeReadability(s) {
  try {
    if (s.text === 'normal' && !s.contrast && s.motion === null) localStorage.removeItem(READABILITY_KEY);
    else localStorage.setItem(READABILITY_KEY, JSON.stringify(s));
  } catch { /* storage blocked: applies for this page view only */ }
}

function osPrefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function motionIsReduced(s) {
  return s.motion === null ? osPrefersReducedMotion() : s.motion;
}

function isMotionReduced() {
  return document.documentElement.getAttribute('data-motion') === 'reduce';
}

function applyReadability(s) {
  const root = document.documentElement;
  if (s.text === 'normal') root.removeAttribute('data-text'); else root.setAttribute('data-text', s.text);
  if (s.contrast) root.setAttribute('data-contrast', 'high'); else root.removeAttribute('data-contrast');
  const wasReduced = isMotionReduced();
  if (motionIsReduced(s)) root.setAttribute('data-motion', 'reduce'); else root.removeAttribute('data-motion');
  if (wasReduced !== isMotionReduced()) document.dispatchEvent(new CustomEvent('konihaus:motion'));
}

let readabilityState = readReadability();
applyReadability(readabilityState);

const nav = document.getElementById('nav');
window.addEventListener('scroll', () => { nav.classList.toggle('scrolled', window.scrollY > 60); });

const i18n = {
  currentLang: getPageLang() || getLangFromPath() || getCookie(LANG_COOKIE) || localStorage.getItem('lang') || 'de',
  supportedLangs: ['de', 'en'/*, 'fr', 'it'*/],
  translations: {},
  baseDir:
  typeof CUSTOM_BASE_DIR !== 'undefined' && CUSTOM_BASE_DIR
    ? CUSTOM_BASE_DIR
    : '/',

  async init() {
    /* language-specific page: remember its language right away, before the translations are fetched */
    const pageLang = getPageLang();
    if (pageLang) persistLanguage(pageLang);
    for (const lang of this.supportedLangs) {
      try {
        const response = await fetch(`${this.baseDir}translations/${lang}.json`);
        this.translations[lang] = await response.json();
      } catch (error) {
        console.error(`Failed to load translation for ${lang}:`, error);
      }
    }
    this.setLanguage(this.currentLang);
    this.setupLanguageSelector();
  },

  setLanguage(lang) {
    if (!this.supportedLangs.includes(lang)) lang = 'de';

    this.currentLang = lang;
    localStorage.setItem('lang', lang);
    setCookie(LANG_COOKIE, lang); 
    document.documentElement.lang = lang;
    const hcaptcha = document.querySelector('.h-captcha');
    if (hcaptcha) hcaptcha.setAttribute('data-lang', lang);
    
    this.updatePageContent();
    renderSafetyStatement();
    applyLanguageBlocks();
    if (typeof updateReadabilityLabels === 'function') updateReadabilityLabels();
    if (typeof cookieConsent !== 'undefined') cookieConsent.refresh();

    const langSelect = document.getElementById('lang-selector');
    if (langSelect) {
      langSelect.value = lang;
    }

    const activeTab = document.querySelector('.pkg-tab.active');
    if (activeTab) {
      const audience = activeTab.dataset.audience;
      updatePackageContent(audience);
    }
  },

  updatePageContent() {
    const elements = document.querySelectorAll('[data-i18n]');
    /* language-specific pages carry their own static text: a key without translation keeps that text
       (other pages keep showing [section.key] so missing keys stay visible) */
    const ownText = !!getLangPages();
    elements.forEach((el) => {
      const keys = el.dataset.i18n.split('.');
      const text = ownText ? this.lookup(...keys) : this.getText(...keys);
      if (text == null) return;

      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (el.placeholder) el.placeholder = text;
        if (el.dataset.i18nValue === 'true') el.value = text;
      } else if (el.dataset.i18nHtml === 'true') {
        el.innerHTML = text;
      } else {
        el.textContent = text;
      }
    });

    this.updateSelectOptions();
  },

  /* translation or null (no placeholder) */
  lookup(section, key) {
    const find = (lang) => {
      let text = this.translations[lang];
      for (const k of [section, key]) {
        text = text ? text[k] : null;
      }
      return text;
    };
    return find(this.currentLang) || find('en') || null;
  },

  getText(section, key) {
    return this.lookup(section, key) || `[${section}.${key}]`;
  },

  updateSelectOptions() {
    const selects = document.querySelectorAll('[data-i18n-options]');
    selects.forEach((select) => {
      const options = select.dataset.i18nOptions.split(',');
      const optionsArray = options.map((opt) => {
        const [section, key] = opt.trim().split('.');
        return this.getText(section, key);
      });

      Array.from(select.options).forEach((option, index) => {
        if (index > 0 && index <= optionsArray.length) {
          option.textContent = optionsArray[index - 1];
        }
      });
    });
  },

  setupLanguageSelector() {
    const langSelect = document.getElementById('lang-selector');
    if (langSelect) {
      langSelect.addEventListener('change', (e) => {
        const lang = e.target.value;
        this.setLanguage(lang);
      });
    }
  },

  t(section, key) {
    return this.getText(section, key);
  },
};

const FORM_LOAD_TIME = Date.now();

async function handleSubmit(event) {
  event.preventDefault();

  const form = event.target;
  const submitBtn = document.getElementById('fsub-btn');
  const statusEl = document.getElementById('form-status');

  const name = document.getElementById('n').value.trim();
  const email = document.getElementById('e').value.trim();
  const interest = document.getElementById('i').value;
  const message = document.getElementById('m').value.trim();

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!name || !email || !message || !emailPattern.test(email)) {
    showFormStatus(statusEl, i18n.getText('contact', 'form_error_invalid'), 'error');
    return;
  }

  const botcheck = form.querySelector('[name="botcheck"]');
  const honeypot2 = form.querySelector('[name="website"]');
  const tooFast = Date.now() - FORM_LOAD_TIME < 3000;
  const looksLikeBot = (botcheck && botcheck.checked) || (honeypot2 && honeypot2.value) || tooFast;

  if (looksLikeBot) {
    showFormStatus(statusEl, i18n.getText('contact', 'form_success'), 'success');
    form.reset();
    return;
  }

  const hCaptchaField = form.querySelector('[name="h-captcha-response"]');
  const hCaptchaWidget = form.querySelector('.h-captcha');
  if (hCaptchaWidget && !(hCaptchaField && hCaptchaField.value)) {
    const fallback = i18n.currentLang === 'en'
      ? 'Please complete the captcha check. If it does not appear, email me at <a href="mailto:hello@konihaus.ch">hello@konihaus.ch</a>.'
      : 'Bitte bestätigen Sie die Captcha-Prüfung. Erscheint sie nicht, schreiben Sie mir an <a href="mailto:hello@konihaus.ch">hello@konihaus.ch</a>.';
    const t = i18n.getText('contact', 'form_error_captcha');
    showFormStatus(statusEl, (t && t !== 'form_error_captcha') ? t : fallback, 'error');
    return;
  }
  const discountField = form.querySelector('#discount-code-field');

  const payload = {
    access_key: form.querySelector('[name="access_key"]').value,
    subject: form.querySelector('[name="subject"]').value,
    from_name: form.querySelector('[name="from_name"]').value,
    name,
    email,
    interest: interest || 'Keine Angabe',
    message,
    language: i18n.currentLang,
  };
  if (hCaptchaField && hCaptchaField.value) {
    payload['h-captcha-response'] = hCaptchaField.value;
  }
  if (discountField && discountField.value) {
    payload.discount_code = discountField.value;
  }

  submitBtn.disabled = true;
  showFormStatus(statusEl, i18n.getText('contact', 'form_sending'), 'sending');

  try {
    const response = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (result.success) {
      showFormStatus(statusEl, i18n.getText('contact', 'form_success'), 'success');
      form.reset();
    } else {
      showFormStatus(statusEl, i18n.getText('contact', 'form_error'), 'error');
    }
  } catch (error) {
    showFormStatus(statusEl, i18n.getText('contact', 'form_error'), 'error');
  } finally {
    submitBtn.disabled = false;
    try { if (window.hcaptcha) window.hcaptcha.reset(); } catch (e) { /* ignore */ }
  }
}

function showFormStatus(el, text, kind) {
  if (!el) return;
  el.innerHTML = text;
  el.hidden = false;
  el.className = `form-status form-status--${kind}`;
}

function setupMobileMenu() {
  const hamburger = document.getElementById('hamburger');
  const drawer = document.getElementById('drawer');

  if (!hamburger || !drawer) return;

  hamburger.addEventListener('click', () => {
    const open = hamburger.classList.toggle('open');
    drawer.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });

  document.querySelectorAll('.drawer-acc').forEach(btn => {
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      document.querySelectorAll('.drawer-acc').forEach(b => {
        const isThis = b === btn;
        const on = isThis ? open : false;
        b.setAttribute('aria-expanded', String(on));
        const sub = document.getElementById(b.getAttribute('aria-controls'));
        if (sub) sub.hidden = !on;
      });
    });
  });

  document.querySelectorAll('.drawer-link').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('open');
      drawer.classList.remove('open');
      document.body.style.overflow = '';
    });
  });
}

function setupScrollAnimations() {
  const reveals = document.querySelectorAll('.reveal');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  });

  reveals.forEach((el) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
  });
}

function setupPackageTabs() {
  const tabs = document.querySelectorAll('.pkg-tab');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const audience = tab.dataset.audience;

      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      updatePackageContent(audience);
    });
  });
}

function updatePackageContent(audience) {
  const titleEl = document.querySelector('.pkg-title');
  if (titleEl) {
    const titleKey = `h2_${audience}`;
    const translatedTitle = i18n.getText('packages', titleKey);
    titleEl.innerHTML = translatedTitle;

    titleEl.classList.remove('senioren', 'mieter', 'ferienhaus');
    if (audience !== 'basis') {
      titleEl.classList.add(audience);
    }
  }

  const pkgFeatured = document.querySelector('.pkg-featured');
  if (pkgFeatured) {
    pkgFeatured.classList.remove('senioren', 'mieter', 'ferienhaus');
    if (audience !== 'basis') {
      pkgFeatured.classList.add(audience);
    }
  }

  const pkgPremium = document.querySelector('.pkg-premium');
  if (pkgPremium) {
    pkgPremium.classList.remove('senioren', 'mieter', 'ferienhaus');
    if (audience !== 'basis') {
      pkgPremium.classList.add(audience);
    }
  }

  const includesEls = document.querySelectorAll('.pkg__includes');
  if (includesEls.length > 0) {
    const includesKey = `pkg_includes_${audience}`;
    const translatedIncludes = i18n.getText('packages', includesKey);
    includesEls.forEach((el) => {
      el.textContent = translatedIncludes;
    });
  }

  const packages = document.querySelectorAll('.pkg');
  packages.forEach((card, index) => {
    const pkgNumber = index + 1;

    const nameEl = card.querySelector('.pkg__name');
    if (nameEl) {
      const nameKey = `pkg${pkgNumber}_name_${audience}`;
      const translatedName = i18n.getText('packages', nameKey);
      nameEl.textContent = translatedName;
    }

    const tagEl = card.querySelector('.pkg__tag');
    if (tagEl) {
      const tagKey = `pkg${pkgNumber}_tag_${audience}`;
      const translatedTag = i18n.getText('packages', tagKey);
      tagEl.textContent = translatedTag;
    }

    const outcomeList = card.querySelector('.pkg__outcomes');
    if (outcomeList) renderFeatureList(outcomeList, pkgNumber, audience, 'outcomes');

    const featureList = card.querySelector('.pkg__list');
    if (featureList) renderFeatureList(featureList, pkgNumber, audience, 'features');
  });

  updatePackageSafetyLine(audience);
}

function renderFeatureList(listEl, pkgNumber, audience, suffix = 'features') {
  const key = `${audience}_pkg${pkgNumber}_${suffix}`;
  const packages = i18n.translations[i18n.currentLang]?.packages;
  const items = packages?.[key];

  if (!Array.isArray(items)) {
    console.warn(`Missing feature list "${key}" for language "${i18n.currentLang}"`);
    listEl.replaceChildren();
    return;
  }

  listEl.replaceChildren(
    ...items.map((text) => {
      const li = document.createElement('li');

      const check = document.createElement('span');
      check.className = 'chk';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = '✓';

      const label = document.createElement('span');
      label.textContent = text;

      li.append(check, label);
      return li;
    })
  );
}

function updatePackageSafetyLine(audience) {
  const line = document.getElementById('pkg-safety-line');
  if (!line) return;

  const audiences = (line.dataset.audiences || '').split(/\s+/).filter(Boolean);
  line.hidden = !audiences.includes(audience);
}

function applyLanguageBlocks() {
  const titleKey = document.body && document.body.dataset.titleKey;
  if (titleKey) {
    const [section, key] = titleKey.split('.');
    const title = getLangPages() ? i18n.lookup(section, key) : i18n.getText(section, key);
    if (title) document.title = title + ' \u2014 Konihaus';
  }

  document.querySelectorAll('[data-legal-doc]').forEach((doc) => {
    const blocks = Array.from(doc.querySelectorAll(':scope > [data-lang]'));
    if (!blocks.length) return;

    const fallbackLang = doc.dataset.fallback || 'de';
    const wanted = blocks.find((b) => b.dataset.lang === i18n.currentLang);
    const shown = wanted || blocks.find((b) => b.dataset.lang === fallbackLang) || blocks[0];
    blocks.forEach((b) => { b.hidden = b !== shown; });

    const notice = doc.querySelector('.legal__notice');
    if (notice) notice.hidden = !!wanted;
  });
}

function renderSafetyStatement() {
  const list = document.getElementById('safety-list');
  if (!list) return;

  const items = i18n.translations[i18n.currentLang]?.contact?.safety_items;
  list.replaceChildren(
    ...(Array.isArray(items) ? items : []).map((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    })
  );
}

function applyDeepLinkedPackage() {
  const params = new URLSearchParams(window.location.search);
  
  const pkgParam = params.get('pkg');
  if (!pkgParam) return;

  const [audience, tierStr] = pkgParam.split('-');
  const tier = parseInt(tierStr, 10);
  const tab = document.querySelector(`.pkg-tab[data-audience="${audience}"]`);
  if (!tab || !tier) return;
  
  const audienceSelect = document.getElementById('i');
  const messageField = document.getElementById('m');
  const card = document.querySelector(`.pkg.d${tier}`);
  if (!audienceSelect || !messageField || !card) return;

  const pkgIndex = tierStr;
  const AUDIENCE_OPTION_INDEX = { basis: 1, mieter: 2, senioren: 3, ferienhaus: 4 };
  const optionIndex = AUDIENCE_OPTION_INDEX[audience];
  if (optionIndex !== undefined) audienceSelect.selectedIndex = optionIndex;

  if (!messageField.value.trim() && pkgIndex !== -1) {
    const packageName = card.querySelector('.pkg__name');
    const price = card.querySelector('.pkg__num');
    if (packageName && price) {
      const template = i18n.getText('contact', 'form_prefill');
      let prefill = template
        .replace('{package}', packageName.textContent.trim())
        .replace('{price}', price.textContent.trim());
        if (typeof applyDiscountToRequest === 'function') {
        prefill = applyDiscountToRequest(prefill, tier - 1);
      }
      messageField.value = prefill;
    }
  }


  document.querySelectorAll('.pkg-tab').forEach((t) => t.classList.remove('active'));
  tab.classList.add('active');
  updatePackageContent(audience);
  const currentHash = window.location.hash.slice(1); 
  if (!currentHash) return;

  if(currentHash === 'packages') {
    requestAnimationFrame(() => {
      const card = document.querySelectorAll('.pkg-grid > .pkg')[tier - 1];
      if (!card) return;
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('pkg--highlight');
      setTimeout(() => card.classList.remove('pkg--highlight'), 2200);
    });
  }
}

function setupPackageAccordion() {
  document.querySelectorAll('.pkg__toggle').forEach((toggle) => {
    toggle.addEventListener('click', (e) => {
      e.preventDefault();

      const panel = document.getElementById(toggle.getAttribute('aria-controls'));
      if (!panel) return;

      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      panel.hidden = !open;

      const pkg = toggle.closest('.pkg');
      if (pkg) pkg.classList.toggle('expanded', open);
    });
  });
}

function setupFaqAccordion() {
  document.querySelectorAll('.faq-list').forEach((list) => {
    const items = [...list.querySelectorAll('.faq-q')]
      .map((toggle) => ({
        toggle,
        panel: document.getElementById(toggle.getAttribute('aria-controls')),
      }))
      .filter(({ panel }) => panel);

    items.forEach(({ toggle }) => {
      toggle.addEventListener('click', () => {
        const shouldOpen = toggle.getAttribute('aria-expanded') !== 'true';

        items.forEach(({ toggle: button, panel }) => {
          const isOpen = button === toggle && shouldOpen;
          button.setAttribute('aria-expanded', String(isOpen));
          panel.hidden = !isOpen;
        });

        // after the layout has changed; only when opening
        if (shouldOpen) {
          const nav = document.getElementById('nav');
          const gap = 15; // space between header and question
          const y = toggle.getBoundingClientRect().top + window.scrollY - (nav ? nav.offsetHeight : 0) - gap;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }
      });
    });
  });
}

function setupPackageRequestButtons() {
  const audienceSelect = document.getElementById('i');
  const messageField = document.getElementById('m');
  if (!audienceSelect || !messageField) return;

  const AUDIENCE_OPTION_INDEX = { basis: 1, mieter: 2, senioren: 3, ferienhaus: 4 };

  document.querySelectorAll('[data-request-pkg]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.pkg');
      const grid = document.querySelector('.pkg-grid');
      if (!card || !grid) return;

      const pkgIndex = Array.from(grid.children).indexOf(card);
      const activeTab = document.querySelector('.pkg-tab.active');
      const audience = activeTab ? activeTab.dataset.audience : 'basis';

      const optionIndex = AUDIENCE_OPTION_INDEX[audience];
      if (optionIndex !== undefined) audienceSelect.selectedIndex = optionIndex;

      if (!messageField.value.trim() && pkgIndex !== -1) {
        const packageName = card.querySelector('.pkg__name');
        const price = card.querySelector('.pkg__num');
        if (packageName && price) {
          const template = i18n.getText('contact', 'form_prefill');
          let prefill = template
            .replace('{package}', packageName.textContent.trim())
            .replace('{price}', price.textContent.trim());
          if (typeof applyDiscountToRequest === 'function') {
            prefill = applyDiscountToRequest(prefill, pkgIndex);
          }
          messageField.value = prefill;
        }
      }

      const contactSection = document.getElementById('contact');
      if (contactSection) contactSection.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

function setupHeroTaglines() {
  const hero = document.querySelector('.hero');
  const container = hero && hero.querySelector('.hero__headline_container');
  if (!container) return;

  const TAGLINES = [
    { bg: 'var(--forest-deep)', class: '', keyPrefix: 'hero_tagline1' },
    { bg: 'var(--marine)', class: 'hero-marine', keyPrefix: 'hero_tagline2' },
    { bg: 'var(--burgundy)', class: 'hero-burgundy', keyPrefix: 'hero_tagline4' },
    { bg: 'var(--gold)', class: 'hero-gold', keyPrefix: 'hero_tagline3' },
  ];
  const HOLD_MS = 5000; 
  const OUT_MS = 450;  
  const IN_MS = 550; 
  const canAnimate = typeof hero.animate === 'function';
  const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  let index = 0;
  let current = container.querySelector('.hero__h1'); 
  let pending = null;                                
  let timer = null;

  function removeStrays() {
    container.querySelectorAll('.hero__h1').forEach((h) => {
      if (h !== current && !(pending && h === pending.incoming)) h.remove();
    });
  }

  function applyTheme(tagline) {
    hero.style.backgroundColor = tagline.bg;
    hero.classList.remove('hero-marine', 'hero-gold', 'hero-burgundy');
    if (tagline.class) hero.classList.add(tagline.class);
  }

  const arts = Array.from(hero.querySelectorAll('.hero__art'));
  const ART_OPACITY = 1;
  let artIndex = 0;

  function showArt(i) {
    if (!arts.length) return;
    const next = arts[i % arts.length];
    const prev = arts[artIndex % arts.length];
    artIndex = i % arts.length;
    if (next === prev) return;
    arts.forEach((a) => a.getAnimations && a.getAnimations().forEach((x) => x.cancel()));
    const instant = !canAnimate || reduceMotion.matches || isMotionReduced();
    if (instant) {
      arts.forEach((a) => a.classList.toggle('is-on', a === next));
      return;
    }
    // same rhythm as the headline: old image leaves to the left, new one enters from the right
    const out = prev.animate(
      [{ opacity: ART_OPACITY, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(-60px)' }],
      { duration: OUT_MS, easing: 'ease-in', fill: 'forwards' }
    );
    next.classList.add('is-on');
    next.animate(
      [{ opacity: 0, transform: 'translateX(60px)' }, { opacity: ART_OPACITY, transform: 'translateX(0)' }],
      { duration: IN_MS, delay: OUT_MS, easing: 'ease-out', fill: 'both' }
    );
    out.finished.then(() => { if (prev !== arts[artIndex]) prev.classList.remove('is-on'); out.cancel(); }).catch(() => {});
  }

  function createHeadline(tagline) {
    const h1 = document.createElement('h1');
    h1.className = 'hero__h1';
    h1.setAttribute('data-i18n', `hero.${tagline.keyPrefix}`); 
    h1.setAttribute('data-i18n-html', 'true');
    h1.innerHTML = i18n.getText('hero', tagline.keyPrefix);
    h1.style.animation = 'none';
    return h1;
  }

  function settle() {
    if (!pending) return;
    const { outgoing, incoming, animations } = pending;
    pending = null;
    animations.forEach((a) => a.cancel());
    outgoing.remove();
    incoming.style.opacity = '';
    current = incoming;
    removeStrays();
    schedule();
  }

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!document.hidden && !pending && !isMotionReduced()) timer = setTimeout(rotate, HOLD_MS);
  }

  function rotate() {
    timer = null;
    if (document.hidden || pending || isMotionReduced()) return;
    if (!current || !container.contains(current)) current = container.querySelector('.hero__h1');
    removeStrays();

    index = (index + 1) % TAGLINES.length;
    const tagline = TAGLINES[index];
    const outgoing = current;
    const incoming = createHeadline(tagline);
    incoming.style.opacity = '0';
    container.appendChild(incoming);
    applyTheme(tagline);
    showArt(index);

    if (!outgoing) { 
      incoming.style.opacity = '';
      current = incoming;
      schedule();
      return;
    }

    if (!canAnimate || reduceMotion.matches) {
      pending = { outgoing, incoming, animations: [] };
      settle();
      return;
    }

    const out = outgoing.animate(
      [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-50px)' }],
      { duration: OUT_MS, easing: 'ease-in', fill: 'forwards' }
    );
    const into = incoming.animate(
      [{ opacity: 0, transform: 'translateY(50px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: IN_MS, delay: OUT_MS, easing: 'ease-out', fill: 'both' }
    );
    const mine = { outgoing, incoming, animations: [out, into] };
    pending = mine;


    Promise.all([out.finished, into.finished])
      .then(() => { if (pending === mine) settle(); })
      .catch(() => {});
  }

  document.addEventListener('konihaus:motion', () => {
    if (isMotionReduced()) {
      clearTimeout(timer);
      timer = null;
      settle();
    } else {
      schedule();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(timer);
      timer = null;
    } else {
      settle();
      removeStrays();
      schedule();
    }
  });

  schedule();
}

function updateReadabilityLabels() {
  const wrap = document.getElementById('a11y-picker');
  if (!wrap) return;
  const t = (key) => i18n.getText('a11y', key);
  wrap.querySelectorAll('[data-i18n^="a11y."]').forEach((el) => {
    el.textContent = t(el.dataset.i18n.split('.')[1]);
  });
  const trigger = wrap.querySelector('.a11y-trigger');
  trigger.title = t('title');          // hover tooltip: "Lesbarkeit" / "Readability"
  trigger.setAttribute('aria-label', t('title'));
  wrap.querySelector('.a11y-seg').setAttribute('aria-label', t('text_size'));
}

function initReadability() {
  const anchor = document.querySelector('.language-picker');
  if (!anchor || document.getElementById('a11y-picker')) return;

  const wrap = document.createElement('div');
  wrap.className = 'a11y-picker';
  wrap.id = 'a11y-picker';
  wrap.innerHTML = `
    <button type="button" class="a11y-trigger" aria-expanded="false" aria-controls="a11y-panel">
      <span class="a11y-aa" aria-hidden="true"><span class="a11y-aa__big">A</span><span class="a11y-aa__small">a</span></span>
    </button>
    <div id="a11y-panel" class="a11y-panel" role="group" aria-labelledby="a11y-title" hidden>
      <div class="a11y-title" id="a11y-title" data-i18n="a11y.title"></div>
      <span class="a11y-lbl" data-i18n="a11y.text_size"></span>
      <div class="a11y-seg" role="group">
        <button type="button" data-text="normal" aria-pressed="false" data-i18n="a11y.size_normal"></button>
        <button type="button" data-text="large" aria-pressed="false" data-i18n="a11y.size_large"></button>
        <button type="button" data-text="xl" aria-pressed="false" data-i18n="a11y.size_xl"></button>
      </div>
      <button type="button" class="a11y-switch" role="switch" aria-checked="false" data-switch="contrast">
        <span data-i18n="a11y.contrast"></span><span class="a11y-switch__track" aria-hidden="true"></span>
      </button>
      <button type="button" class="a11y-switch" role="switch" aria-checked="false" data-switch="motion">
        <span data-i18n="a11y.motion"></span><span class="a11y-switch__track" aria-hidden="true"></span>
      </button>
      <div class="a11y-foot">
        <span class="a11y-note" data-i18n="a11y.note"></span>
        <button type="button" class="a11y-reset" data-i18n="a11y.reset"></button>
      </div>
    </div>`;
  anchor.parentNode.insertBefore(wrap, anchor);

  const trigger = wrap.querySelector('.a11y-trigger');
  const panel = wrap.querySelector('.a11y-panel');
  const sizeButtons = [...wrap.querySelectorAll('.a11y-seg button')];
  const switches = [...wrap.querySelectorAll('.a11y-switch')];

  function sync() {
    const s = readabilityState;
    sizeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.text === s.text)));
    switches.forEach((b) => {
      const on = b.dataset.switch === 'contrast' ? s.contrast : motionIsReduced(s);
      b.setAttribute('aria-checked', String(on));
    });
    trigger.classList.toggle('is-active', s.text !== 'normal' || s.contrast || s.motion === true);
  }

  function update(next) {
    readabilityState = { ...readabilityState, ...next };
    applyReadability(readabilityState);
    writeReadability(readabilityState);
    sync();
  }

  function closePanel(returnFocus = false) {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (returnFocus) trigger.focus();
  }

  function openPanel() {
    panel.style.setProperty('--a11y-top', `${Math.round(trigger.getBoundingClientRect().bottom + 8)}px`);
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    const pressed = sizeButtons.find((b) => b.getAttribute('aria-pressed') === 'true');
    (pressed || sizeButtons[0]).focus();
  }

  trigger.addEventListener('click', () => (panel.hidden ? openPanel() : closePanel()));
  sizeButtons.forEach((b) => b.addEventListener('click', () => update({ text: b.dataset.text })));
  switches.forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.switch === 'contrast') update({ contrast: !readabilityState.contrast });
    else update({ motion: !motionIsReduced(readabilityState) });
  }));
  wrap.querySelector('.a11y-reset').addEventListener('click', () => update({ ...READABILITY_DEFAULT }));

  wrap.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      event.preventDefault();
      closePanel(true);
    }
  });
  document.addEventListener('click', (event) => { if (!wrap.contains(event.target)) closePanel(); });
  wrap.addEventListener('focusout', () => {
    setTimeout(() => { if (!wrap.contains(document.activeElement)) closePanel(); }, 0);
  });
  window.addEventListener('resize', () => closePanel());

  updateReadabilityLabels();
  sync();
}

function initLanguagePicker() {
  const picker = document.querySelector(".language-picker");
  if (!picker) return;

  const trigger = picker.querySelector(".language-trigger");
  const menu = picker.querySelector(".language-options");
  const current = picker.querySelector(".language-current");
  const select = picker.querySelector("#lang-selector");
  const options = [...picker.querySelectorAll(".language-option")];
  const storageKey = LANG_COOKIE; 

  function readLanguage() {
    const fromCookie = getCookie(storageKey);
    if (fromCookie) return fromCookie;
    try {
      return localStorage.getItem(storageKey) || localStorage.getItem('lang');
    } catch {
      return null;
    }
  }

  function syncLanguage() {
    current.textContent = select.value.toUpperCase();

    options.forEach((option) => {
      const selected = option.dataset.lang === select.value;
      option.setAttribute("aria-current", String(selected));

      if (selected) {
        trigger.setAttribute(
          "aria-label",
          `Language: ${option.firstElementChild.textContent.trim()}`
        );
      }
    });
  }

  function closeMenu(returnFocus = false) {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (returnFocus) trigger.focus();
  }

  function openMenu() {
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");

    const selected = options.find(
      (option) => option.dataset.lang === select.value
    );
    (selected || options[0]).focus();
  }

  select.addEventListener("change", () => {
    syncLanguage();

    try {
      localStorage.setItem(storageKey, select.value);
    } catch {

    }
  });

  trigger.addEventListener("click", () => {
    if (menu.hidden) openMenu();
    else closeMenu();
  });

  options.forEach((option) => {
    option.addEventListener("click", () => {
      const lang = option.dataset.lang;
      select.value = lang;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      closeMenu(true);

      /* language-specific page: go to the page of the chosen language */
      const pages = getLangPages();
      const target = pages && pages[lang];
      if (target && normalizePath(target) !== normalizePath(window.location.pathname)) {
        window.location.assign(target + window.location.search + window.location.hash);
      }
    });
  });

  picker.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      event.preventDefault();
      closeMenu(true);
    }

    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();

      if (menu.hidden) {
        openMenu();
        return;
      }

      const index = options.indexOf(document.activeElement);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      options[
        (index + direction + options.length) % options.length
      ].focus();
    }
  });

  document.addEventListener("click", (event) => {
    if (!picker.contains(event.target)) closeMenu();
  });

  picker.addEventListener("focusout", () => {
    setTimeout(() => {
      if (!picker.contains(document.activeElement)) closeMenu();
    }, 0);
  });

  const savedLanguage = i18n.currentLang || readLanguage();
  const supported = [...select.options].some(
    (option) => option.value === savedLanguage
  );

  if (supported) {
    select.value = savedLanguage;
  }

  syncLanguage();
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

document.addEventListener('DOMContentLoaded', () => {

  document.querySelectorAll('.why__item').forEach(e => {
    const art = e.getAttribute('data-why-item');
    if(!art) return;
    const language = localStorage.getItem('lang') || 'de';

    const articles = {
      privacy: {
        de: 'datenschutz-by-default',
        en: 'privacy-by-default'
      },
      novendor: {
        de: 'kein-vendor-lock-in',
        en: 'no-vendor-lock-in'
      },
      personal: {
        de: 'persoenlicher-service',
        en: 'personal-service'
      },
      energy: {
        de: 'energieeffizienz',
        en: 'energy-efficiency'
      },
      future: {
        de: 'zukunftssicher',
        en: 'future-proof'
      },
      swiss: {
        de: 'schweizer-qualitaet',
        en: 'swiss-quality'
      }
    }

    const article = articles[art];
    if(!article) return;

    const url = `https://blog.konihaus.ch/${language}/insights/${articles[art][language]}`;
    const targetUrl = `${url}?from-website`;

    e.setAttribute('title', url);

    e.addEventListener('click', () => {
      window.open(targetUrl);
    });
  })


  i18n.init().then(() => {
    if (typeof cookieConsent !== 'undefined') cookieConsent.init();
    document.documentElement.classList.remove('no-js');

    initReadability();
    initLanguagePicker();

    setupMobileMenu();
    setupScrollAnimations();
    setupPackageTabs();
    setupPackageAccordion();
    setupFaqAccordion();
    setupPackageRequestButtons();
    setupHeroTaglines();
    updatePackageContent('basis');
    applyDeepLinkedPackage();
    if (typeof initQrDiscount === 'function') initQrDiscount();
    

    const requiredFonts = Promise.all([
      document.fonts.load('400 1em "Outfit"'),
      document.fonts.load('400 1em "Cormorant Garamond"'),
      document.fonts.load('italic 400 1em "Cormorant Garamond"')
    ]);

    const safetyTimeout = new Promise(resolve => setTimeout(resolve, 2500));

    Promise.race([requiredFonts, safetyTimeout]).finally(() => {
      document.documentElement.classList.remove("fonts-loading");
    });

    const moreStart = document.getElementById('morestart');
    if (moreStart) {
      moreStart.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('trustsection').scrollIntoView();
      });
    }
  });
});

if ('serviceWorker' in navigator && !/^app\./.test(location.hostname)) { // the app subdomain has no service worker
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      setInterval(() => {
        registration.update();
      }, 60000);
    }).catch((error) => {
      console.warn('Service Worker registration failed:', error);
    });
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('Service Worker updated');
  });
}