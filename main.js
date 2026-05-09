// Nav scroll
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => { nav.classList.toggle('scrolled', window.scrollY > 60); });

// Hamburger menu
const hamburger = document.getElementById('hamburger');
const drawer = document.getElementById('drawer');
hamburger.addEventListener('click', () => {
  const open = hamburger.classList.toggle('open');
  drawer.classList.toggle('open', open);
  document.body.style.overflow = open ? 'hidden' : '';
});
document.querySelectorAll('.drawer-link').forEach(link => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('open');
    drawer.classList.remove('open');
    document.body.style.overflow = '';
  });
});

// Scroll reveal
const obs = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.1, rootMargin: '0px 0px -32px 0px' });
document.querySelectorAll('.reveal').forEach(el => obs.observe(el));

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', function(e) {
    const t = document.querySelector(this.getAttribute('href'));
    if (t) { e.preventDefault(); window.scrollTo({ top: t.offsetTop - 80, behavior: 'smooth' }); }
  });
});

// Form
function handleSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector('.fsub');
  btn.textContent = '✓ Gesendet — ich melde mich bald!';
  btn.style.background = 'var(--forest-mid)';
  btn.disabled = true;
}

// Package buttons → scroll to contact
document.querySelectorAll('.pkg__btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelector('#contact').scrollIntoView({ behavior: 'smooth' });
  });
});

// Hero tagline rotation with fade animation
const hero = document.querySelector('.hero');
const taglines = [
  { bg: 'var(--forest-deep)', class: '', text: 'Ihr Zuhause.<br><em>Intelligent.</em><br>Privat.' },
  { bg: 'var(--marine)', class: 'hero-marine', text: 'Ihre Ferienwohnung.<br><em>Geschützt.</em><br>Immer im Griff.' },
  { bg: 'var(--gold)', class: 'hero-gold', text: 'Alles in Ordnung.<br><em>Immer.</em><br>Für Sie und Ihre Familie.' },
  { bg: 'var(--burgundy)', class: 'hero-burgundy', text: 'Ihre Mietwohnung.<br><em>Smart und Spurlos.</em><br>Ohne Bohren.' }
];
let taglineIndex = 0;

setInterval(() => {
  taglineIndex = (taglineIndex + 1) % taglines.length;
  const current = taglines[taglineIndex];

  // Get current h1
  const heroH1 = document.querySelector('.hero__h1:not(.hero__h1-next)');

  // Create new h1 for incoming text (starts invisible)
  const newH1 = document.createElement('h1');
  newH1.className = 'hero__h1 hero__h1-next';
  newH1.innerHTML = current.text;
  newH1.style.opacity = '0';
  heroH1.parentNode.insertBefore(newH1, heroH1.nextSibling);

  // Update background color and gradient overlay via class
  hero.style.backgroundColor = current.bg;
  hero.classList.remove('hero-marine', 'hero-gold', 'hero-burgundy');
  if (current.class) hero.classList.add(current.class);

  // Fade in new h1
  setTimeout(() => {
    newH1.classList.add('fade-in');
    heroH1.style.animation = 'fadeOutUp 0.5s ease forwards';
  }, 10);
  newH1.classList.remove('hero__h1-next', 'fade-in');

  // Remove old h1 after animation
  setTimeout(() => {
    heroH1.remove();
    newH1.style.opacity = '1';
  }, 500);
}, 3000);

// Package tabs switching
const pkgTabs = document.querySelectorAll('.pkg-tab');
const pkgCards = document.querySelectorAll('.pkg');
const pkgFeatured = document.querySelector('.pkg-featured');
const pkgTitle = document.querySelector('.pkg-title');

pkgTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const audience = tab.dataset.audience;

    // Update active tab
    pkgTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // Update featured package background color
    pkgFeatured.classList.remove('senioren', 'mieter', 'ferienhaus');
    if (audience !== 'basis') {
      pkgFeatured.classList.add(audience);
    }

    // Update title color class
    pkgTitle.classList.remove('senioren', 'mieter', 'ferienhaus');
    if (audience !== 'basis') {
      pkgTitle.classList.add(audience);
    }

    // Update title text
    if (pkgTitle && pkgTitle.dataset[audience]) {
      pkgTitle.innerHTML = pkgTitle.dataset[audience];
    }

    // Update package content
    pkgCards.forEach(card => {
      const nameEl = card.querySelector('.pkg__name');
      const tagEl = card.querySelector('.pkg__tag');

      if (nameEl && nameEl.dataset[audience]) {
        nameEl.textContent = nameEl.dataset[audience];
      }
      if (tagEl && tagEl.dataset[audience]) {
        tagEl.textContent = tagEl.dataset[audience];
      }
    });
  });
});
