const QR_PARAM = 'qr';
const QR_STORAGE_KEY = 'konihaus_qr_discount';
const QR_POPUP_SEEN_KEY = 'konihaus_qr_popup_shown';
const QR_EXCLUDED_PKG_INDEX = 0;

function generateDiscountCode(seed) {
  const CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; 
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

  }
}

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
   
  }

  if (arrivedViaQr && !alreadyShown) {
    showQrModal(discount);
    try { sessionStorage.setItem(QR_POPUP_SEEN_KEY, '1'); } catch {}
  }
}
