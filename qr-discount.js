const QR_PARAM = 'qr';
// v2: codes are now verified by the API. The old key held codes generated in the browser, so it is dropped on init.
const QR_STORAGE_KEY = 'konihaus_qr_discount_v2';
const QR_LEGACY_STORAGE_KEY = 'konihaus_qr_discount';
const QR_POPUP_SEEN_KEY = 'konihaus_qr_popup_shown';
const QR_EXCLUDED_PKG_INDEX = 0;
const QR_API_BASE = 'https://project-zovba.vercel.app'.replace(/\/+$/, ''); // no trailing slash (//api -> 308 -> CORS error)
const QR_KEY_PATTERN = /^[A-Za-z0-9-]{1,80}$/;

// Asks the API for the code belonging to a qr key. Returns the code, or null if the key is unknown / anything fails.
async function fetchDiscountCode(qrKey) {
  if (!QR_KEY_PATTERN.test(qrKey)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${QR_API_BASE}/api/getcode?str=${encodeURIComponent(qrKey)}`, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.success && typeof data.code === 'string' && data.code ? data.code : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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

  }
}

// Synchronous: only returns a discount that was already verified by the API and stored.
function getActiveDiscount() {
  return readStoredDiscount();
}

function isEligiblePkgIndex(pkgIndex) {
  return typeof pkgIndex === 'number' && pkgIndex !== QR_EXCLUDED_PKG_INDEX && pkgIndex >= 0;
}

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
    if(discount) {
     card.querySelectorAll('.discount').forEach((el) => {
       el.hidden = false;
     });
     card.querySelectorAll('.nodiscount').forEach((el) => {
       el.hidden = true;
     });
    }
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

      }
    });
  }

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

async function initQrDiscount() {
  setupQrModal();

  // Drop codes that an earlier version generated in the browser.
  try { localStorage.removeItem(QR_LEGACY_STORAGE_KEY); } catch {}

  // A previously verified discount keeps working across pages.
  updateDiscountBanners();

  const qrParam = new URLSearchParams(window.location.search).get(QR_PARAM);
  if (!qrParam) return;

  // Only a key that exists in codes.json (checked by the API) yields a code; anything else is ignored.
  const code = await fetchDiscountCode(qrParam);
  if (!code) return;

  const existing = readStoredDiscount();
  const discount = existing && existing.source === qrParam && existing.code === code
    ? existing
    : { code, source: qrParam, firstSeen: Date.now() };
  writeStoredDiscount(discount);
  updateDiscountBanners();

  let alreadyShown = false;
  try {
    alreadyShown = sessionStorage.getItem(QR_POPUP_SEEN_KEY) === '1';
  } catch {

  }

  if (!alreadyShown) {
    showQrModal(discount);
    try { sessionStorage.setItem(QR_POPUP_SEEN_KEY, '1'); } catch {}
  }
}
