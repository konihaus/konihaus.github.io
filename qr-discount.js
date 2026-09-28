// QR sticker discount code
// ---------------------------------------------------------------------------
// A visitor who scans a physical Konihaus sticker lands on
// index_kh.html?qr=<hash> (<hash> identifies which sticker, e.g. per
// location or campaign). This file:
//   1. Turns that <hash> into a stable 8-character discount code — the same
//      sticker always produces the same code, with no backend/database
//      needed, so Koni can still tell which sticker converts just by
//      comparing codes that come back on enquiries.
//   2. Shows a one-time popup with the code and the offer (10% off the
//      first year, valid on every package above the entry-level Starter
//      tier).
//   3. Remembers the code (localStorage) so it survives reloads and a
//      later visit in the same browser, and auto-fills it into the quote
//      request whenever the visitor asks about an eligible package —
//      without them having to copy/paste anything.
//
// Depends on i18n (scripts.js) for translated strings via data-i18n, and
// hooks into scripts.js's setupPackageRequestButtons()/applyDeepLinkedPackage()
// through the small integration points marked in that file.

const QR_PARAM = 'qr';
const QR_STORAGE_KEY = 'konihaus_qr_discount';
const QR_POPUP_SEEN_KEY = 'konihaus_qr_popup_shown';
// Grid position (0-based) of the entry-level "Starter" card in every audience
// tab — it never carries the discount. Cards 1, 2, 3 (Essential/Advanced/
// Premium, whatever they're labelled per audience) do.
const QR_EXCLUDED_PKG_INDEX = 0;

// Deterministic 8-character code from the sticker's ?qr= value. Not meant to
// be cryptographically secure — just stable and not trivially guessable from
// the URL hash alone (a fixed salt + two independent FNV-1a passes).
function generateDiscountCode(seed) {
  const CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/O/1/I/L — avoids misreads
  const SALT = 'konihaus-qr-v1';

  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  let h1 = fnv1a(`${SALT}:${seed}`);
  let h2 = fnv1a(`${seed}:${SALT}:2`);

  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CHARSET[h1 % CHARSET.length];
    h1 = Math.floor(h1 / CHARSET.length) ^ (h1 >>> 3);
  }
  for (let i = 0; i < 4; i++) {
    code += CHARSET[h2 % CHARSET.length];
    h2 = Math.floor(h2 / CHARSET.length) ^ (h2 >>> 3);
  }
  return code;
}

function readStoredDiscount() {
  try {
    const raw = localStorage.getItem(QR_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredDiscount(data) {
  try {
    localStorage.setItem(QR_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Keep the site usable when storage is unavailable — the code just
    // won't survive a reload without the ?qr= param in that case.
  }
}

// The discount active for this visitor right now: a fresh ?qr= param takes
// priority (and is (re)stored), otherwise whatever was stored on an earlier
// visit/reload in this browser.
function getActiveDiscount() {
  const params = new URLSearchParams(window.location.search);
  const qrParam = params.get(QR_PARAM);

  if (qrParam) {
    const existing = readStoredDiscount();
    if (existing && existing.source === qrParam) return existing;
    const fresh = { code: generateDiscountCode(qrParam), source: qrParam, firstSeen: Date.now() };
    writeStoredDiscount(fresh);
    return fresh;
  }

  return readStoredDiscount();
}

function isEligiblePkgIndex(pkgIndex) {
  return typeof pkgIndex === 'number' && pkgIndex !== QR_EXCLUDED_PKG_INDEX && pkgIndex >= 0;
}

// Appends the discount line to an already-built quote-request message, and
// mirrors the code into the hidden form field so it also reaches Koni's
// inbox even if the visitor edits the message text afterwards. Called from
// scripts.js right after it builds the "package + price" prefill line.
function applyDiscountToRequest(message, pkgIndex) {
  const discount = getActiveDiscount();
  const field = document.getElementById('discount-code-field');

  if (!discount || !isEligiblePkgIndex(pkgIndex)) {
    return message;
  }

  if (field) field.value = discount.code;

  const template = i18n.getText('contact', 'form_prefill_discount');
  const line = template.replace('{code}', discount.code);
  return message ? `${message}\n\n${line}` : line;
}

function updateDiscountBanners() {
  const discount = getActiveDiscount();
  const grid = document.querySelector('.pkg-grid');
  if (!grid) return;

  Array.from(grid.children).forEach((card, index) => {
    const badge = card.querySelector('.pkg__discount-badge');
    if (!badge) return;
    badge.hidden = !discount || !isEligiblePkgIndex(index);
  });
}

function closeQrModal() {
  const modal = document.getElementById('qr-modal');
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
}

function showQrModal(discount) {
  const modal = document.getElementById('qr-modal');
  const codeEl = document.getElementById('qr-modal-code');
  if (!modal || !codeEl) return;

  codeEl.textContent = discount.code;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function setupQrModal() {
  const modal = document.getElementById('qr-modal');
  if (!modal) return;

  modal.querySelectorAll('[data-qr-close]').forEach((el) => {
    el.addEventListener('click', closeQrModal);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeQrModal();
  });

  const copyBtn = document.getElementById('qr-modal-copy');
  const codeEl = document.getElementById('qr-modal-code');
  if (copyBtn && codeEl) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(codeEl.textContent.trim());
        const original = copyBtn.textContent;
        copyBtn.textContent = i18n.getText('qr', 'copied');
        setTimeout(() => { copyBtn.textContent = original; }, 1800);
      } catch {
        // Clipboard API unavailable/denied — the code is still visible to copy by hand.
      }
    });
  }

  // The CTA scrolls to the contact form and — if the visitor hasn't typed
  // anything yet — pre-fills a short note so the code travels with the
  // enquiry even if they never touch a specific package card first.
  const cta = document.getElementById('qr-modal-cta');
  if (cta) {
    cta.addEventListener('click', () => {
      const discount = getActiveDiscount();
      const messageField = document.getElementById('m');
      const field = document.getElementById('discount-code-field');
      if (discount && field) field.value = discount.code;
      if (discount && messageField && !messageField.value.trim()) {
        const template = i18n.getText('contact', 'form_prefill_discount');
        messageField.value = template.replace('{code}', discount.code);
      }
      closeQrModal();
    });
  }
}

function initQrDiscount() {
  setupQrModal();

  const discount = getActiveDiscount();
  updateDiscountBanners();
  if (!discount) return;

  const params = new URLSearchParams(window.location.search);
  const arrivedViaQr = params.has(QR_PARAM);
  let alreadyShown = false;
  try {
    alreadyShown = sessionStorage.getItem(QR_POPUP_SEEN_KEY) === '1';
  } catch {
    // If sessionStorage is unavailable, fall through and show it once anyway.
  }

  if (arrivedViaQr && !alreadyShown) {
    showQrModal(discount);
    try { sessionStorage.setItem(QR_POPUP_SEEN_KEY, '1'); } catch {}
  }
}

// initQrDiscount() is called from scripts.js, inside i18n.init().then(...),
// rather than from its own DOMContentLoaded listener here — the popup and
// badges both need i18n.getText()/translations already loaded, and since
// i18n.init() is async, a separate listener could fire before that resolves.
