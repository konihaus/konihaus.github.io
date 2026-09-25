// Nav scroll
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => { nav.classList.toggle('scrolled', window.scrollY > 60); });
// i18n Configuration
const i18n = {
  currentLang: localStorage.getItem('lang') || 'de',
  supportedLangs: ['de', 'en'/*, 'fr', 'it'*/],
  translations: {},
  baseDir:
  typeof CUSTOM_BASE_DIR !== 'undefined' && CUSTOM_BASE_DIR
    ? CUSTOM_BASE_DIR
    : './',

  async init() {
    // Load all translation files
    for (const lang of this.supportedLangs) {
      try {
        const response = await fetch(`${this.baseDir}translations/${lang}.json`);
        this.translations[lang] = await response.json();
      } catch (error) {
        console.error(`Failed to load translation for ${lang}:`, error);
      }
    }

    // Set initial language
    this.setLanguage(this.currentLang);
    this.setupLanguageSelector();
  },

  setLanguage(lang) {
    if (!this.supportedLangs.includes(lang)) lang = 'de';

    this.currentLang = lang;
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang;

    // hCaptcha reads data-lang when its widget first mounts. Keeping this attribute in sync
    // on every language change covers the normal case (visitor picks a language, then reaches
    // the contact form); it can't retroactively re-render a widget that already mounted in a
    // different language, since hCaptcha itself doesn't support that.
    const hcaptcha = document.querySelector('.h-captcha');
    if (hcaptcha) hcaptcha.setAttribute('data-lang', lang);
    
    // Update all elements with data-i18n attribute
    this.updatePageContent();
    renderSafetyStatement();
    applyLanguageBlocks();
    if (typeof cookieConsent !== 'undefined') cookieConsent.refresh();

    // Update language selector dropdown
    const langSelect = document.getElementById('lang-selector');
    if (langSelect) {
      langSelect.value = lang;
    }

    // Update package content with current selected audience
    const activeTab = document.querySelector('.pkg-tab.active');
    if (activeTab) {
      const audience = activeTab.dataset.audience;
      updatePackageContent(audience);
    }
  },

  updatePageContent() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach((el) => {
      const keys = el.dataset.i18n.split('.');
      const text = this.getText(...keys);

      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (el.placeholder) el.placeholder = text;
        if (el.dataset.i18nValue === 'true') el.value = text;
      } else if (el.dataset.i18nHtml === 'true') {
        el.innerHTML = text;
      } else {
        el.textContent = text;
      }
    });

    // Update select options
    this.updateSelectOptions();
  },

  // Falls back to English if a key is missing in the current language, rather than showing
  // broken "[section.key]" placeholder text — lets content exist in only some languages
  // (e.g. a page translated so far into just DE/EN) without breaking FR/IT visitors.
  getText(section, key) {
    const lookup = (lang) => {
      let text = this.translations[lang];
      for (const k of [section, key]) {
        text = text ? text[k] : null;
      }
      return text;
    };
    return lookup(this.currentLang) || lookup('en') || `[${section}.${key}]`;
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

  // Helper to get text for dynamic content
  t(section, key) {
    return this.getText(section, key);
  },
};

// Form handling — sends real email via Web3Forms (https://web3forms.com), a free
// forms-to-email service that works from a static site with no backend of its own.
//
// Anti-spam layers, in the order they run:
//   1. Two honeypot fields ("botcheck" — Web3Forms' own field name, and "website" — a second,
//      independent one) that must stay empty. A bot that fills every field trips one of these.
//   2. A time trap: reject anything submitted less than 3 seconds after the page loaded, since
//      no human reads the form and fills it that fast.
//   3. hCaptcha (the <div class="h-captcha"> in the form + Web3Forms' client script) — only
//      enforced if you've turned it on as the "Block Spam" method in your Web3Forms dashboard;
//      until then this layer is a no-op.
//   4. Web3Forms' own server-side spam filtering on every submission that reaches them.
//
// Layers 1-2 fail silently (the visitor still sees the normal success message) so a bot never
// learns which check caught it. A genuine visitor should never trip any of them.
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

  // Honeypots: a real visitor never fills or checks these (they're off-screen, see .hp-field).
  const botcheck = form.querySelector('[name="botcheck"]');
  const honeypot2 = form.querySelector('[name="website"]');
  const tooFast = Date.now() - FORM_LOAD_TIME < 3000;
  const looksLikeBot = (botcheck && botcheck.checked) || (honeypot2 && honeypot2.value) || tooFast;

  if (looksLikeBot) {
    // Never reveal that we caught it — show the same success state a real visitor would get.
    showFormStatus(statusEl, i18n.getText('contact', 'form_success'), 'success');
    form.reset();
    return;
  }

  const hCaptchaField = form.querySelector('[name="h-captcha-response"]');

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
  }
}

// The status strings come only from our own translation files (never from user input),
// so innerHTML here is safe and lets the error message include a clickable mailto link.
function showFormStatus(el, text, kind) {
  if (!el) return;
  el.innerHTML = text;
  el.hidden = false;
  el.className = `form-status form-status--${kind}`;
}

// Mobile menu toggle
function setupMobileMenu() {
  const hamburger = document.getElementById('hamburger');
  const drawer = document.getElementById('drawer');

  if (!hamburger || !drawer) return;

  hamburger.addEventListener('click', () => {
    const open = hamburger.classList.toggle('open');
    drawer.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });

  // Close drawer on link click
  document.querySelectorAll('.drawer-link').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('open');
      drawer.classList.remove('open');
      document.body.style.overflow = '';
    });
  });
}

// Scroll animations
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

// Package tab switching
function setupPackageTabs() {
  const tabs = document.querySelectorAll('.pkg-tab');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const audience = tab.dataset.audience;

      // Update active tab
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      // Update package content
      updatePackageContent(audience);
    });
  });
}

function updatePackageContent(audience) {
  // Update title from i18n
  const titleEl = document.querySelector('.pkg-title');
  if (titleEl) {
    const titleKey = `h2_${audience}`;
    const translatedTitle = i18n.getText('packages', titleKey);
    titleEl.innerHTML = translatedTitle;

    // Update title color class
    titleEl.classList.remove('senioren', 'mieter', 'ferienhaus');
    if (audience !== 'basis') {
      titleEl.classList.add(audience);
    }
  }

  // Update featured package background color
  const pkgFeatured = document.querySelector('.pkg-featured');
  if (pkgFeatured) {
    pkgFeatured.classList.remove('senioren', 'mieter', 'ferienhaus');
    if (audience !== 'basis') {
      pkgFeatured.classList.add(audience);
    }
  }

  // Update featured package background color
  const pkgPremium = document.querySelector('.pkg-premium');
  if (pkgPremium) {
    pkgPremium.classList.remove('senioren', 'mieter', 'ferienhaus');
    if (audience !== 'basis') {
      pkgPremium.classList.add(audience);
    }
  }

  // Update package "includes" label based on audience
  const includesEls = document.querySelectorAll('.pkg__includes');
  if (includesEls.length > 0) {
    const includesKey = `pkg_includes_${audience}`;
    const translatedIncludes = i18n.getText('packages', includesKey);
    includesEls.forEach((el) => {
      el.textContent = translatedIncludes;
    });
  }

  // Update package names and tags from i18n
  const packages = document.querySelectorAll('.pkg');
  packages.forEach((card, index) => {
    // Package number = card position, 1-based (1 = first card)
    const pkgNumber = index + 1;

    // Update package name
    const nameEl = card.querySelector('.pkg__name');
    if (nameEl) {
      const nameKey = `pkg${pkgNumber}_name_${audience}`;
      const translatedName = i18n.getText('packages', nameKey);
      nameEl.textContent = translatedName;
    }

    // Update package tag
    const tagEl = card.querySelector('.pkg__tag');
    if (tagEl) {
      const tagKey = `pkg${pkgNumber}_tag_${audience}`;
      const translatedTag = i18n.getText('packages', tagKey);
      tagEl.textContent = translatedTag;
    }

    // Outcomes (2-3 benefit lines, always visible) and hardware list (under "Details"):
    // one <li> per entry of "<audience>_pkg<N>_outcomes" / "<audience>_pkg<N>_features" in the language JSON
    const outcomeList = card.querySelector('.pkg__outcomes');
    if (outcomeList) renderFeatureList(outcomeList, pkgNumber, audience, 'outcomes');

    const featureList = card.querySelector('.pkg__list');
    if (featureList) renderFeatureList(featureList, pkgNumber, audience, 'features');
  });

  updatePackageSafetyLine(audience);
}

// Builds the <li> items of one list in a package card from the language JSON, e.g.
//   "packages": { "senioren_pkg2_outcomes": ["Angehörige erhalten bei Rauch, CO oder Wasser ...", ...],
//                 "senioren_pkg2_features": ["Smart-Home-Zentrale", "2× Bewegungsmelder", ...] }
// suffix is "outcomes" (what the customer gets, 2-3 lines) or "features" (the hardware list under Details).
// Adding, removing or reordering entries only means editing the array in the JSON.
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
      label.textContent = text; // textContent: JSON text is never parsed as HTML

      li.append(check, label);
      return li;
    })
  );
}

// One-line "not an emergency service" hint under the package grid.
// Shown only for the audiences listed in its data-audiences attribute (see index.html), i.e. the
// packages with alarm/monitoring features. It links to the full statement (#safety) in the contact section.
function updatePackageSafetyLine(audience) {
  const line = document.getElementById('pkg-safety-line');
  if (!line) return;

  const audiences = (line.dataset.audiences || '').split(/\s+/).filter(Boolean);
  line.hidden = !audiences.includes(audience);
}

// Legal pages (impressum / datenschutz / agb): shows the block of a document that matches the current
// language. If the document has no block for the current language, it falls back to the language named in
// the container's data-fallback attribute (default "de") and shows the notice paragraph of that document.
//   datenschutz.html, agb.html: <div data-legal-doc data-fallback="en">   DE + EN, FR/IT see EN, notice legal.en_de_notice
//   a German-only document:     <div data-legal-doc>                      FR/IT/EN see DE, notice legal.german_only
// To add a translation, add <div data-lang="xx" lang="xx" hidden>…</div> next to the existing blocks.
function applyLanguageBlocks() {
  const titleKey = document.body && document.body.dataset.titleKey;
  if (titleKey) {
    const [section, key] = titleKey.split('.');
    document.title = i18n.getText(section, key) + ' \u2014 Konihaus';
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

// Full "not an emergency service" statement in the contact section.
// Title comes from contact.safety_title, the points from contact.safety_items (array) in the language JSON.
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

// "Details" toggle of a package card (all screen sizes): shows / hides the hardware list.
// The outcomes, the button and the price note stay visible. Cards toggle independently,
// so visitors can open two cards side by side to compare the hardware.
// Deep-linking into a specific package from another page (e.g. "Paket ansehen" on an
// example page): the link carries ?pkg=<audience>-<tier 1-4>, e.g. ?pkg=senioren-4.
// On load, this switches to the right audience tab and scrolls straight to that card,
// instead of leaving the visitor to find it themselves — most useful on mobile, where the
// packages section is otherwise a long scroll past four stacked tabs.
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
  const AUDIENCE_OPTION_INDEX = { basis: 1, senioren: 2, mieter: 3, ferienhaus: 4 };
  const optionIndex = AUDIENCE_OPTION_INDEX[audience];
  if (optionIndex !== undefined) audienceSelect.selectedIndex = optionIndex;

  if (!messageField.value.trim() && pkgIndex !== -1) {
    const packageName = card.querySelector('.pkg__name');
    const price = card.querySelector('.pkg__num');
    if (packageName && price) {
      const template = i18n.getText('contact', 'form_prefill');
      messageField.value = template
        .replace('{package}', packageName.textContent.trim())
        .replace('{price}', price.textContent.trim());
    }
  }


  document.querySelectorAll('.pkg-tab').forEach((t) => t.classList.remove('active'));
  tab.classList.add('active');
  updatePackageContent(audience);
  const currentHash = window.location.hash.slice(1); 
  if (!currentHash) return;
  
  // Wait a tick for the tab switch's content/layout to settle before measuring position.
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

// "FAQ beside pricing" accordion: same independent-toggle pattern as setupPackageAccordion
// (each question opens/closes on its own, several can be open at once).
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
      });
    });
  });
}

// Examples carousel: arrow buttons scroll the track by one card width (CSS scroll-snap
// handles touch/trackpad swiping on its own). Arrows disable themselves at each end so
// they stay usable once more than one card is in the track.
function setupExamplesCarousel() {
  const track = document.getElementById('examples-track');
  if (!track) return;

  const prev = document.querySelector('.examples__arrow--prev');
  const next = document.querySelector('.examples__arrow--next');
  if (!prev || !next) return;

  const cardGap = 20;

  function updateArrows() {
    const maxScroll = track.scrollWidth - track.clientWidth;
    prev.disabled = track.scrollLeft <= 4;
    next.disabled = track.scrollLeft >= maxScroll - 4;
  }

  prev.addEventListener('click', () => {
    const card = track.querySelector('.examples__card');
    const step = card ? card.offsetWidth + cardGap : 300;
    track.scrollBy({ left: -step, behavior: 'smooth' });
  });

  next.addEventListener('click', () => {
    const card = track.querySelector('.examples__card');
    const step = card ? card.offsetWidth + cardGap : 300;
    track.scrollBy({ left: step, behavior: 'smooth' });
  });

  track.addEventListener('scroll', updateArrows);
  window.addEventListener('resize', updateArrows);
  updateArrows();
}


// "Jetzt anfragen" on a package card: carries the chosen customer category and package
// into the enquiry form instead of leaving the visitor to repeat their choice.
//   - the "Interesse" select is matched by option position, not by text, so it works
//     the same in every language (the option order mirrors the audience tabs and never changes);
//   - the specific package name and price are written into the message field, since
//     there is no separate package field — only if the visitor hasn't typed anything yet,
//     so a second click (or an earlier draft) is never overwritten.
function setupPackageRequestButtons() {
  const audienceSelect = document.getElementById('i');
  const messageField = document.getElementById('m');
  if (!audienceSelect || !messageField) return;

  const AUDIENCE_OPTION_INDEX = { basis: 1, senioren: 2, mieter: 3, ferienhaus: 4 };

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
          messageField.value = template
            .replace('{package}', packageName.textContent.trim())
            .replace('{price}', price.textContent.trim());
        }
      }

      const contactSection = document.getElementById('contact');
      if (contactSection) contactSection.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

// Hero tagline rotation
//
// Exactly one headline is on screen at any time. The rules that keep it that way:
//  - the current headline is tracked in a variable, never looked up from the DOM;
//  - a rotation never starts while another one is still running (no setInterval: the next rotation is
//    scheduled only after the previous one has finished);
//  - the loop pauses while the tab is hidden and re-syncs when it comes back (timers and animation
//    frames run at different speeds in background tabs, which is what used to leave stale headlines behind);
//  - before and after every rotation, any headline other than the current one is removed.
function setupHeroTaglines() {
  const hero = document.querySelector('.hero');
  const container = hero && hero.querySelector('.hero__headline_container');
  if (!container) return;

  const TAGLINES = [
    { bg: 'var(--forest-deep)', class: '', keyPrefix: 'hero_tagline1' },
    { bg: 'var(--marine)', class: 'hero-marine', keyPrefix: 'hero_tagline2' },
    { bg: 'var(--gold)', class: 'hero-gold', keyPrefix: 'hero_tagline3' },
    { bg: 'var(--burgundy)', class: 'hero-burgundy', keyPrefix: 'hero_tagline4' },
  ];
  const HOLD_MS = 5000;   // time a headline stays fully visible (about 6 s per headline including the transition)
  const OUT_MS = 450;     // old headline fades out and up ...
  const IN_MS = 550;      // ... then the new one fades in from below (sequential: the two never overlap)
  const canAnimate = typeof hero.animate === 'function';
  const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  let index = 0;
  let current = container.querySelector('.hero__h1'); // the headline that is on screen
  let pending = null;                                 // { outgoing, incoming, animations } while a transition runs
  let timer = null;

  // remove every headline except the current one (and the incoming one during a transition)
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

  function createHeadline(tagline) {
    const h1 = document.createElement('h1');
    h1.className = 'hero__h1';
    h1.setAttribute('data-i18n', `hero.${tagline.keyPrefix}`); // keeps it translated when the language changes
    h1.setAttribute('data-i18n-html', 'true');
    h1.innerHTML = i18n.getText('hero', tagline.keyPrefix);
    h1.style.animation = 'none'; // the CSS entrance animation is for the first page load only
    return h1;
  }

  // Finish the running transition right now. Safe to call at any time and more than once.
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
    if (!document.hidden && !pending) timer = setTimeout(rotate, HOLD_MS);
  }

  function rotate() {
    timer = null;
    if (document.hidden || pending) return;
    if (!current || !container.contains(current)) current = container.querySelector('.hero__h1');
    removeStrays();

    index = (index + 1) % TAGLINES.length;
    const tagline = TAGLINES[index];
    const outgoing = current;
    const incoming = createHeadline(tagline);
    incoming.style.opacity = '0';
    container.appendChild(incoming);
    applyTheme(tagline);

    if (!outgoing) { // nothing to fade out (should not happen): just show the new headline
      incoming.style.opacity = '';
      current = incoming;
      schedule();
      return;
    }

    if (!canAnimate || reduceMotion.matches) { // no motion: swap immediately
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

    // Both animations run on the same timeline; when they are done (or the tab returns), settle.
    Promise.all([out.finished, into.finished])
      .then(() => { if (pending === mine) settle(); })
      .catch(() => {}); // cancelled by settle(): nothing left to do
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(timer);
      timer = null;
    } else {
      settle();        // finish a transition that was interrupted by hiding the tab
      removeStrays();
      schedule();
    }
  });

  schedule();
}

function initLanguagePicker() {
  const picker = document.querySelector(".language-picker");
  if (!picker) return;

  const trigger = picker.querySelector(".language-trigger");
  const menu = picker.querySelector(".language-options");
  const current = picker.querySelector(".language-current");
  const select = picker.querySelector("#lang-selector");
  const options = [...picker.querySelectorAll(".language-option")];
  const storageKey = "konihaus-language";

  function readLanguage() {
    try {
      return localStorage.getItem(storageKey);
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
      // Keep the selector usable when storage is unavailable.
    }
  });

  trigger.addEventListener("click", () => {
    if (menu.hidden) openMenu();
    else closeMenu();
  });

  options.forEach((option) => {
    option.addEventListener("click", () => {
      select.value = option.dataset.lang;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      closeMenu(true);
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

  picker.addEventListener("focusout", (event) => {
    if (!picker.contains(event.relatedTarget)) closeMenu();
  });

  // Restore storage BEFORE updating the visible selector.
  const savedLanguage = readLanguage();
  const supported = [...select.options].some(
    (option) => option.value === savedLanguage
  );

  if (supported) {
    select.value = savedLanguage;
  }

  syncLanguage();

  // Apply the restored language through your translation handler.
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLanguagePicker);
} else {
  initLanguagePicker();
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  i18n.init().then(() => {
    if (typeof cookieConsent !== 'undefined') cookieConsent.init();
    setupMobileMenu();
    setupScrollAnimations();
    setupPackageTabs();
    setupPackageAccordion();
    setupFaqAccordion();
    setupExamplesCarousel();
    setupPackageRequestButtons();
    setupHeroTaglines();
    // Initialize package content with i18n on page load
    updatePackageContent('basis');
    applyDeepLinkedPackage();
    const moreStart = document.getElementById('morestart'); // only on the home page
    if (moreStart) {
      moreStart.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('trustsection').scrollIntoView();
      });
    }
  });
});

// Register Service Worker for PWA functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      // console.log('Service Worker registered successfully:', registration);

      // Check for updates periodically
      setInterval(() => {
        registration.update();
      }, 60000); // Check every minute
    }).catch((error) => {
      console.warn('Service Worker registration failed:', error);
    });
  });

  // Handle service worker updates
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('Service Worker updated');
  });
}
