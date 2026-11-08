// Sign in with a 6 digit code sent by email. A code, not a link, so the
// installed iPhone app stays in the app instead of opening Safari.

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function card(inner) {
  return `<div class="login-card">
    <div class="brand"><span class="brand-mark" aria-hidden="true">TML</span><span class="brand-name">TML Group</span></div>
    ${inner}
  </div>`;
}

const linkBox = () => `
      <details class="link-help">
        <summary>Already have a sign in link from the email?</summary>
        <p class="hint">Copy the whole link (or the whole address of the page it opened) and paste it here.</p>
        <form id="f-link" novalidate>
          <input class="input" name="link" inputmode="url" autocomplete="off" placeholder="Paste the link here">
          <button class="btn primary" style="width:100%;margin-top:10px" type="submit">Sign in with link</button>
        </form>
      </details>`;

function bindLink(root, store, onError) {
  root.querySelector('#f-link').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = e.target.querySelector('button'); b.disabled = true; b.textContent = 'Checking…';
    try { await store.verifyLink(e.target.link.value); }
    catch (err) { onError(friendly(err)); }
  });
}

function friendly(err) {
  const m = String(err?.message || err || '');
  if (/rate|too many|security purposes/i.test(m)) return 'Too many codes asked for. Wait a minute, then try again.';
  if (/expired|invalid|token/i.test(m)) return 'That code is wrong or has expired. Check the latest email or send a new code.';
  if (/fetch|network/i.test(m)) return 'No connection. Check your internet and try again.';
  return m || 'Something went wrong. Try again.';
}

export function mount(root, { store }) {
  let email = '';
  try { email = localStorage.getItem('tml-email') || ''; } catch { /* private mode */ }

  const askEmail = (error = '') => {
    root.innerHTML = card(`
      <h1>Sign in</h1>
      <p>We'll email you a 6 digit code.</p>
      <form id="f-email" novalidate>
        <label class="field"><span>Email</span>
          <input class="input" type="email" name="email" autocomplete="email" required value="${esc(email)}"></label>
        ${error ? `<p class="error-text" role="alert">${esc(error)}</p>` : ''}
        <button class="btn primary" style="width:100%" type="submit">Send code</button>
      </form>
      ${linkBox()}`);
    bindLink(root, store, askEmail);
    const f = root.querySelector('#f-email');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      email = f.email.value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return askEmail('Enter a valid email address.');
      const b = f.querySelector('button'); b.disabled = true; b.textContent = 'Sending…';
      try { await store.sendCode(email); try { localStorage.setItem('tml-email', email); } catch { /* ignore */ } askCode(); }
      catch (err) { askEmail(friendly(err)); }
    });
  };

  const askCode = (error = '') => {
    root.innerHTML = card(`
      <h1>Check your email</h1>
      <p>We sent an email to ${esc(email)}. It can take a minute to arrive. Check spam too.</p>
      <form id="f-code" novalidate>
        <label class="field"><span>6 digit code</span>
          <input class="input code-input" name="code" inputmode="numeric" autocomplete="one-time-code"
            pattern="[0-9]{6,8}" maxlength="8" required autofocus></label>
        ${error ? `<p class="error-text" role="alert">${esc(error)}</p>` : ''}
        <button class="btn primary" style="width:100%" type="submit">Sign in</button>
      </form>
      ${linkBox()}
      <form>
        <div class="sheet-actions" style="justify-content:space-between">
          <button class="btn small" type="button" id="b-back">Change email</button>
          <button class="btn small" type="button" id="b-resend">Send a new code</button>
        </div>
      </form>`);
    const f = root.querySelector('#f-code');
    const input = f.code;
    input.focus();
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 8);
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = input.value;
      if (!/^\d{6,8}$/.test(code)) return askCode('Enter the full code from the email.');
      const b = f.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Checking…';
      try { await store.verifyCode(email, code); }
      catch (err) { askCode(friendly(err)); }
    });
    bindLink(root, store, askCode);
    root.querySelector('#b-back').addEventListener('click', () => askEmail());
    root.querySelector('#b-resend').addEventListener('click', async () => {
      try { await store.sendCode(email); askCode('New code sent. Use the newest email.'); }
      catch (err) { askCode(friendly(err)); }
    });
  };

  askEmail();
}
