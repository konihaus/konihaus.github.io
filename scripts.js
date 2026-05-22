// Nav scroll
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => { nav.classList.toggle('scrolled', window.scrollY > 60); });
// i18n Configuration
const i18n = {
  currentLang: localStorage.getItem('lang') || 'de',
  supportedLangs: ['de', 'en', 'fr', 'it'],
  translations: {},

  async init() {
    // Load all translation files
    for (const lang of this.supportedLangs) {
      try {
        const response = await fetch(`./translations/${lang}.json`);
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

    // Update all elements with data-i18n attribute
    this.updatePageContent();

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

  getText(section, key) {
    const keys = [section, key];
    let text = this.translations[this.currentLang];

    for (const k of keys) {
      text = text ? text[k] : null;
    }

    return text || `[${section}.${key}]`;
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

// Form handling
function handleSubmit(event) {
  event.preventDefault();

  const name = document.getElementById('n').value;
  const email = document.getElementById('e').value;
  const interest = document.getElementById('i').value;
  const message = document.getElementById('m').value;

  if (!name || !email || !message) {
    alert('Bitte füllen Sie alle Felder aus');
    return;
  }

  // Prepare form data
  const formData = {
    name,
    email,
    interest: interest || 'Keine Angabe',
    message,
    language: i18n.currentLang,
    timestamp: new Date().toISOString(),
  };

  // Send via email (using formspree or similar service)
  console.log('Form submitted:', formData);

  // For now, just log and show success
  alert(`Danke! Ihre Nachricht wurde versendet.\n\nWir melden uns innerhalb von 24 Stunden.`);
  event.target.reset();
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
    // Package number is 1-based (1, 2, or 3)
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

    // Update features with segment-specific keys
    const featureList = card.querySelector('.pkg__list');
    if (featureList) {
      const featureItems = featureList.querySelectorAll('li');
      featureItems.forEach((item, featureIndex) => {
        // Feature number is 1-based
        const featureNumber = featureIndex + 1;
        // Build segment-specific key: basis_pkg1_feature_1, senioren_pkg2_feature_5, etc.
        const featureKey = `${audience}_pkg${pkgNumber}_feature_${featureNumber}`;
        const translatedFeature = i18n.getText('packages', featureKey);

        // Check if the key exists (not a fallback like [packages.basis_pkg3_feature_7])
        const isFallback = translatedFeature.startsWith('[') && translatedFeature.endsWith(']');

        if (isFallback) {
          // Hide empty features
          item.style.display = 'none';
        } else {
          // Show and update feature text
          item.style.display = '';
          item.textContent = translatedFeature;
        }
      });
    }
  });
}

// Package details accordion for mobile
function setupPackageAccordion() {
  const toggles = document.querySelectorAll('.pkg__toggle');

  toggles.forEach((toggle) => {
    toggle.addEventListener('click', (e) => {
      e.preventDefault();

      const pkg = toggle.closest('.pkg');
      if (!pkg) return;

      const isExpanded = pkg.classList.contains('expanded');

      // Close all other packages
      toggles.forEach((otherToggle) => {
        const otherPkg = otherToggle.closest('.pkg');
        if (otherPkg && otherPkg !== pkg) {
          otherPkg.classList.remove('expanded');
          otherToggle.setAttribute('aria-expanded', 'false');
        }
      });

      // Toggle current package
      pkg.classList.toggle('expanded');
      toggle.setAttribute('aria-expanded', !isExpanded);
    });
  });
}

// Hero tagline rotation
function setupHeroTaglines() {
  const hero = document.querySelector('.hero');
  if (!hero) return;

  const taglines = [
    { bg: 'var(--forest-deep)', class: '', keyPrefix: 'hero_tagline1' },
    { bg: 'var(--marine)', class: 'hero-marine', keyPrefix: 'hero_tagline2' },
    { bg: 'var(--gold)', class: 'hero-gold', keyPrefix: 'hero_tagline3' },
    { bg: 'var(--burgundy)', class: 'hero-burgundy', keyPrefix: 'hero_tagline4' }
  ];

  let taglineIndex = 0;

  const rotateTagline = () => {
    taglineIndex = (taglineIndex + 1) % taglines.length;
    const current = taglines[taglineIndex];

    // Get the hero h1 container
    const h1Container = hero.querySelector('.hero__headline_container');
    if (!h1Container) return;

    const heroH1 = h1Container.querySelector('.hero__h1:not(.hero__h1-next)');
    if (!heroH1) return;

    // Get translated tagline text
    const taglineKey = current.keyPrefix;
    const taglineText = i18n.getText('hero', taglineKey);

    // Create new h1 for incoming text
    const newH1 = document.createElement('h1');
    newH1.className = 'hero__h1 hero__h1-next';
    newH1.setAttribute('data-i18n', `hero.${taglineKey}`);
    newH1.setAttribute('data-i18n-html', 'true');
    newH1.innerHTML = taglineText;
    newH1.style.opacity = '0';
    h1Container.appendChild(newH1);

    // Update background color and class immediately
    hero.style.backgroundColor = current.bg;
    hero.classList.remove('hero-marine', 'hero-gold', 'hero-burgundy');
    if (current.class) hero.classList.add(current.class);

    // Trigger animations using requestAnimationFrame for smooth timing
    requestAnimationFrame(() => {
      // Start fade out of old h1
      heroH1.style.animation = 'fadeOutUp 0.5s ease-in forwards';

      // Start fade in of new h1
      newH1.style.animation = 'fadeInDown 0.5s ease-out forwards';
      newH1.style.animationDelay = '0.2s';
      //newH1.style.opacity = '1';
    });

    // Remove old h1 after animation completes
    setTimeout(() => {
      heroH1.remove();
      newH1.classList.remove('hero__h1-next');
    }, 500);
  };

  // Start rotation after initial delay
  setInterval(rotateTagline, 6000);
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  i18n.init().then(() => {
    setupMobileMenu();
    setupScrollAnimations();
    setupPackageTabs();
    setupPackageAccordion();
    setupHeroTaglines();
    // Initialize package content with i18n on page load
    updatePackageContent('basis');
  });
});

// Register Service Worker for PWA functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      console.log('Service Worker registered successfully:', registration);

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
