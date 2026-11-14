/*
 * konihaus-chat.js: floating chat bubble for konihaus.ch, blog.konihaus.ch and app.konihaus.ch.
 * Messages go to the Konihaus API, which forwards them to Koni on Telegram. Koni's replies show up here.
 *
 * Usage: <script src="konihaus-chat.js" defer></script>   (optional: data-endpoint="https://.../api/chat")
 * Language: taken from <html lang>, "de" or "en" (anything else -> en).
 * Storage: one random conversation id in localStorage ("konihaus-chat"), created only when the visitor
 * sends the first message. No cookies, no tracking, nothing is sent before the first message.
 */
(function () {
  'use strict';
  if (window.__konihausChat) return;
  window.__konihausChat = true;

  var script = document.currentScript;
  var ENDPOINT = (script && script.getAttribute('data-endpoint')) || 'https://project-zovba.vercel.app/api/chat';
  var KEY = 'konihaus-chat';
  var POLL_FAST = 5000, POLL_MID = 15000, WAIT_MS = 10 * 60 * 1000, TYPING_MS = 25000; // poll only for 10 minutes after the last activity

  var T = {
    en: {
      title: 'Chat with Koni', sub: 'Smart homes in Switzerland',
      open: 'Open chat', close: 'Close chat', minimise: 'Minimise',
      hello: 'Hello! Ask me anything about smart homes, Home Assistant or Konihaus. I usually answer within a few hours.',
      ph: 'Write a message…', send: 'Send',
      emailAsk: 'Optional: your email, so I can reach you if you leave the page',
      emailPh: 'you@example.com', name: 'Your name (optional)',
      note: 'Sent to our team through Telegram. Please don\'t share passwords or sensitive data.',
      privacy: 'Privacy policy', privHref: 'https://konihaus.ch/datenschutz.html',
      sending: 'Sending…', failed: 'Could not send. Please try again or use the contact form.',
      tooMany: 'Too many messages in a short time. Please wait a minute.', badEmail: 'Please check the email address.',
      sentHint: 'Delivered. Replies appear here while this page is open.',
      koni: 'Koni', you: 'You', typing: 'Koni is typing'
    },
    de: {
      title: 'Chat mit Koni', sub: 'Smart Homes in der Schweiz',
      open: 'Chat öffnen', close: 'Chat schliessen', minimise: 'Minimieren',
      hello: 'Guten Tag! Fragen Sie mich alles zu Smart Home, Home Assistant oder Konihaus. Ich antworte in der Regel innerhalb weniger Stunden.',
      ph: 'Nachricht schreiben…', send: 'Senden',
      emailAsk: 'Optional: Ihre E-Mail, damit ich Sie erreiche, falls Sie die Seite verlassen',
      emailPh: 'sie@beispiel.ch', name: 'Ihr Name (optional)',
      note: 'Wird über Telegram an unser Team übermittelt. Bitte keine Passwörter oder sensiblen Daten senden.',
      privacy: 'Datenschutzerklärung', privHref: 'https://konihaus.ch/datenschutz.html',
      sending: 'Wird gesendet…', failed: 'Senden fehlgeschlagen. Bitte erneut versuchen oder das Kontaktformular nutzen.',
      tooMany: 'Zu viele Nachrichten in kurzer Zeit. Bitte warten Sie eine Minute.', badEmail: 'Bitte prüfen Sie die E-Mail-Adresse.',
      sentHint: 'Zugestellt. Antworten erscheinen hier, solange diese Seite geöffnet ist.',
      koni: 'Koni', you: 'Sie', typing: 'Koni schreibt'
    }
  };
  function pageLang() { return (document.documentElement.lang || 'en').toLowerCase().slice(0, 2) === 'de' ? 'de' : 'en'; }
  var lang = pageLang();
  function t(k) { return T[lang][k]; }

  // ---- state ----
  var state = { sid: null, last: 0, msgs: [], open: false, pollTimer: null, unread: 0, sentOnce: false, activeAt: 0, typingUntil: 0, typingTimer: null };
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && /^[a-f0-9]{12,32}$/.test(saved.sid)) {
      state.sid = saved.sid; state.last = saved.last || 0; state.msgs = (saved.msgs || []).slice(-50);
      state.sentOnce = state.msgs.some(function (m) { return m.from === 'me'; });
    }
  } catch (e) { /* storage unavailable: chat still works for this page view */ }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ sid: state.sid, last: state.last, msgs: state.msgs.slice(-50), ts: Date.now() })); } catch (e) { }
  }
  function newSid() {
    var a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  // ---- styles (scoped by the kc- prefix; colours can be overridden with --kc-* on :root) ----
  var css = '\
.kc-root{--kc-ink:var(--kc-marine,#1e2535);--kc-ink-deep:#141a26;--kc-accent:var(--kc-forest,#2a4a35);--kc-accent-hover:#3d6b4f;--kc-bg:#fbf8f2;--kc-line:#e3dccd;--kc-text:#1e2535;--kc-muted:#5d6678;--kc-me:#2a4a35;--kc-koni:#ece6d8;position:fixed;right:20px;bottom:20px;z-index:2147483000;font:16px/1.45 Outfit,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--kc-text)}\
.kc-root *{box-sizing:border-box}\
.kc-fab{display:flex;align-items:center;gap:.5rem;height:56px;min-width:56px;padding:0 18px 0 16px;border:2px solid #fff;border-radius:28px;background:var(--kc-ink);color:#f4eedf;cursor:pointer;box-shadow:0 6px 24px rgba(20,26,38,.35);font:inherit;font-weight:500;transition:transform .15s,background .15s}\
.kc-fab:hover{background:var(--kc-ink-deep);transform:translateY(-1px)}\
.kc-fab:focus-visible,.kc-btn:focus-visible,.kc-x:focus-visible,.kc-in:focus-visible,.kc-field:focus-visible{outline:3px solid #d6bd78;outline-offset:2px}\
.kc-fab svg{width:24px;height:24px;flex:none}\
.kc-badge{display:none;min-width:20px;height:20px;border-radius:10px;background:#c0392b;color:#fff;font-size:12px;line-height:20px;text-align:center;padding:0 5px}\
.kc-has-unread .kc-badge{display:inline-block}\
.kc-panel{display:none;position:absolute;right:0;bottom:70px;width:370px;max-width:calc(100vw - 24px);height:560px;max-height:calc(100vh - 110px);background:var(--kc-bg);border:2px solid #fff;border-radius:16px;box-shadow:0 12px 48px rgba(20,26,38,.35);overflow:hidden;flex-direction:column}\
.kc-open .kc-panel{display:flex}.kc-open .kc-fab{display:none}\
.kc-head{display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--kc-ink);color:#f4eedf}\
.kc-av{width:40px;height:40px;border-radius:50%;background:#f4eedf;color:var(--kc-ink);display:grid;place-items:center;font-weight:600;font-size:18px;flex:none}\
.kc-ht{flex:1;min-width:0}.kc-h1{font-weight:600;font-size:1rem;line-height:1.2}.kc-h2{font-size:.8rem;opacity:.8}\
.kc-x{border:0;background:transparent;color:inherit;cursor:pointer;width:36px;height:36px;border-radius:8px;display:grid;place-items:center}\
.kc-x:hover{background:rgba(255,255,255,.12)}.kc-x svg{width:20px;height:20px}\
.kc-log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}\
.kc-m{max-width:84%;padding:9px 13px;border-radius:14px;font-size:.95rem;white-space:pre-wrap;overflow-wrap:anywhere}\
.kc-m.koni{align-self:flex-start;background:var(--kc-koni);border-bottom-left-radius:4px}\
.kc-m.me{align-self:flex-end;background:var(--kc-me);color:#fff;border-bottom-right-radius:4px}\
.kc-m.err{align-self:center;background:#f6e3e1;color:#7a2018;font-size:.85rem;max-width:95%}\
.kc-typing{display:flex;gap:4px;align-items:center;padding:12px 14px}.kc-typing i{width:7px;height:7px;border-radius:50%;background:#5d6678;opacity:.4;animation:kc-bounce 1.2s infinite}.kc-typing i:nth-child(2){animation-delay:.2s}.kc-typing i:nth-child(3){animation-delay:.4s}@keyframes kc-bounce{0%,60%,100%{opacity:.35;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}\
.kc-hint{align-self:center;color:var(--kc-muted);font-size:.78rem;text-align:center}\
.kc-opt{border-top:1px solid var(--kc-line);padding:8px 12px 0;display:none}\
.kc-opt.show{display:block}.kc-opt label{display:block;font-size:.78rem;color:var(--kc-muted);margin-bottom:4px}\
.kc-field{width:100%;border:1px solid var(--kc-line);border-radius:8px;padding:8px 10px;font:inherit;font-size:.9rem;background:#fff;color:var(--kc-text);margin-bottom:6px}\
.kc-form{display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--kc-line);background:#fff;align-items:flex-end}\
.kc-in{flex:1;resize:none;border:1px solid var(--kc-line);border-radius:12px;padding:10px 12px;font:inherit;font-size:1rem;max-height:120px;min-height:44px;background:var(--kc-bg);color:var(--kc-text)}\
.kc-btn{width:44px;height:44px;border:0;border-radius:50%;background:var(--kc-accent);color:#fff;cursor:pointer;display:grid;place-items:center;flex:none}\
.kc-btn:hover{background:var(--kc-accent-hover)}.kc-btn:disabled{opacity:.5;cursor:default}.kc-btn svg{width:20px;height:20px}\
.kc-foot{padding:6px 14px 10px;font-size:.72rem;color:var(--kc-muted);background:#fff;text-align:center}\
.kc-foot a{color:inherit;text-decoration:underline}\
.kc-hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;opacity:0}\
@media (max-width:520px){.kc-root{right:12px;bottom:12px}.kc-open{right:0;bottom:0;left:0;top:0}.kc-panel{position:fixed;inset:0;width:100%;max-width:none;height:100%;max-height:none;border-radius:0;border:0}.kc-fab span.kc-label{display:none}.kc-fab{padding:0 16px}}\
@media (prefers-reduced-motion:reduce){.kc-fab,.kc-log{transition:none;scroll-behavior:auto}.kc-typing i{animation:none;opacity:.7}}\
@media print{.kc-root{display:none}}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ---- DOM ----
  var ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  var root = document.createElement('div');
  root.className = 'kc-root';
  root.setAttribute('lang', lang);
  root.innerHTML =
    '<button type="button" class="kc-fab" aria-expanded="false" aria-controls="kc-panel">' + ICON_CHAT +
    '<span class="kc-label"></span><span class="kc-badge" aria-hidden="true">1</span></button>' +
    '<section class="kc-panel" id="kc-panel" role="dialog" aria-modal="false" aria-labelledby="kc-title">' +
    '<header class="kc-head"><div class="kc-av" aria-hidden="true">K</div><div class="kc-ht"><div class="kc-h1" id="kc-title"></div><div class="kc-h2"></div></div>' +
    '<button type="button" class="kc-x" aria-label="">' + ICON_X + '</button></header>' +
    '<div class="kc-log" role="log" aria-live="polite"></div>' +
    '<div class="kc-opt"><label for="kc-email"></label><input class="kc-field kc-email" id="kc-email" type="email" autocomplete="email" maxlength="120"></div>' +
    '<form class="kc-form" autocomplete="off"><input class="kc-hp" type="text" name="website" tabindex="-1" aria-hidden="true" autocomplete="off">' +
    '<textarea class="kc-in" rows="1" maxlength="1000" aria-label=""></textarea>' +
    '<button type="submit" class="kc-btn" aria-label="">' + ICON_SEND + '</button></form>' +
    '<div class="kc-foot"><span class="kc-note"></span> <a class="kc-priv" href=""></a></div></section>';
  document.body.appendChild(root);

  var $ = function (s) { return root.querySelector(s); };
  var fab = $('.kc-fab'), panel = $('.kc-panel'), log = $('.kc-log'), form = $('.kc-form'),
    input = $('.kc-in'), sendBtn = $('.kc-btn'), optBox = $('.kc-opt'), emailInput = $('.kc-email'), hp = $('.kc-hp');

  function applyTexts() {
    $('.kc-label').textContent = t('title');
    fab.setAttribute('aria-label', t('open'));
    $('.kc-h1').textContent = t('title'); $('.kc-h2').textContent = t('sub');
    $('.kc-x').setAttribute('aria-label', t('minimise'));
    input.setAttribute('aria-label', t('ph')); input.placeholder = t('ph');
    sendBtn.setAttribute('aria-label', t('send'));
    optBox.querySelector('label').textContent = t('emailAsk'); emailInput.placeholder = t('emailPh');
    $('.kc-note').textContent = t('note');
    var a = $('.kc-priv'); a.textContent = t('privacy'); a.href = t('privHref');
  }
  applyTexts();
  new MutationObserver(function () { var l = pageLang(); if (l !== lang) { lang = l; root.setAttribute('lang', l); applyTexts(); if (state.open) render(); } })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  function bubble(cls, text) {
    var d = document.createElement('div'); d.className = 'kc-m ' + cls; d.textContent = text; log.appendChild(d); return d;
  }
  function scrollDown() { log.scrollTop = log.scrollHeight; }
  function render() {
    log.innerHTML = '';
    bubble('koni', t('hello'));
    state.msgs.forEach(function (m) { bubble(m.from === 'me' ? 'me' : 'koni', m.text); });
    if (state.sentOnce) { var h = document.createElement('div'); h.className = 'kc-hint'; h.textContent = t('sentHint'); log.appendChild(h); }
    if (Date.now() < state.typingUntil) {
      var ty = document.createElement('div'); ty.className = 'kc-m koni kc-typing'; ty.setAttribute('role', 'status'); ty.setAttribute('aria-label', t('typing'));
      ty.innerHTML = '<i></i><i></i><i></i>'; log.appendChild(ty);
    }
    optBox.classList.toggle('show', state.sentOnce && !state.emailGiven);
    scrollDown();
  }

  function setOpen(v) {
    state.open = v;
    root.classList.toggle('kc-open', v);
    fab.setAttribute('aria-expanded', String(v));
    if (v) { state.unread = 0; root.classList.remove('kc-has-unread'); render(); setTimeout(function () { input.focus(); }, 50); checkNow(); }
    else { clearTimeout(state.pollTimer); fab.focus(); }
  }
  fab.addEventListener('click', function () { setOpen(true); });
  $('.kc-x').addEventListener('click', function () { setOpen(false); });
  root.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.open) setOpen(false); });

  input.addEventListener('input', function () { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : sendBtn.click(); }
  });

  function showErr(text) { var d = bubble('err', text); scrollDown(); setTimeout(function () { d.remove(); }, 8000); }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || sendBtn.disabled) return;
    var email = emailInput.value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showErr(t('badEmail')); return; }
    if (!state.sid) state.sid = newSid();
    sendBtn.disabled = true;
    fetch(ENDPOINT + '/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sid: state.sid, text: text, email: email || undefined, lang: lang, page: location.href, website: hp.value })
    }).then(function (r) {
      if (r.status === 429) throw new Error('many');
      return r.json().then(function (j) { if (!r.ok || !j.success) throw new Error('fail'); });
    }).then(function () {
      state.msgs.push({ from: 'me', text: text }); state.sentOnce = true; if (email) state.emailGiven = true;
      input.value = ''; input.style.height = 'auto'; save(); render(); state.activeAt = Date.now(); schedule();
    }).catch(function (err) {
      showErr(err.message === 'many' ? t('tooMany') : t('failed'));
    }).then(function () { sendBtn.disabled = false; input.focus(); });
  });

  // ---- polling for Koni's replies ----
  // Polling happens ONLY while the chat window is open (and the tab is visible, and the visitor has written at least once).
  // One check when the window opens, then every 5 s for 2 minutes after the last activity, every 15 s after that,
  // and it stops 10 minutes after the last activity. Closing the window or hiding the tab stops it at once.
  function poll() {
    clearTimeout(state.pollTimer);
    if (!state.open || !state.sid || !state.sentOnce || document.hidden) return;
    fetch(ENDPOINT + '/poll?sid=' + state.sid + '&after=' + state.last)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.messages || !j.messages.length) return;
        var real = 0, typing = false;
        j.messages.forEach(function (m) {
          if (m.t > state.last) state.last = m.t;
          if (m.typing) { if (j.now && j.now - m.t < TYPING_MS) typing = true; return; } // "Koni is typing" marker, not a message
          state.msgs.push({ from: 'koni', text: m.text }); real++;
        });
        state.activeAt = Date.now();
        if (real) { state.typingUntil = 0; save(); } else if (typing) state.typingUntil = Date.now() + TYPING_MS;
        clearTimeout(state.typingTimer);
        if (state.typingUntil > Date.now()) state.typingTimer = setTimeout(function () { state.typingUntil = 0; if (state.open) render(); }, state.typingUntil - Date.now() + 50);
        if (state.open) render(); else if (real) { state.unread += real; root.classList.add('kc-has-unread'); root.querySelector('.kc-badge').textContent = String(state.unread); }
      }).catch(function () { }).then(schedule);
  }
  function schedule() {
    clearTimeout(state.pollTimer);
    var idle = Date.now() - state.activeAt;
    if (!state.open || !state.sid || !state.sentOnce || document.hidden || idle > WAIT_MS) return;
    var d = idle < 120000 ? POLL_FAST : POLL_MID;
    state.pollTimer = setTimeout(poll, d);
  }
  function checkNow() { poll(); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && state.open) checkNow(); });
})();
