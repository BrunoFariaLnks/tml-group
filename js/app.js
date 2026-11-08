// App shell: navigation, data loading, live sync, toasts, dialogs.
import * as store from './store.js';
import * as login from './screens/login.js';
import { legalRows, legalChanges, legalOrphans } from './model.js';

const SCREENS = [
  { id: 'today', label: 'Today', icon: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>' },
  { id: 'deadlines', label: 'Deadlines', icon: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="m9 15 2 2 4-4"/>' },
  { id: 'money', label: 'Money', icon: '<path d="M4 17 9.5 11.5l4 4L20 9"/><path d="M15 9h5v5"/>' },
  { id: 'guides', label: 'Guides', icon: '<path d="M5 4.5h9.5L19 9v10.5H5z"/><path d="M14 4.5V9h5M8.5 13h7M8.5 16.5h5"/>' },
  { id: 'more', label: 'More', icon: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 7l2.6 1.5M17.2 15.5l2.6 1.5M4.2 17l2.6-1.5M17.2 8.5 19.8 7"/>' },
];
const svg = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const state = {
  session: null,
  screen: 'today',
  online: navigator.onLine,
  company: null,
  deadlines: [],
  transactions: [],
  rules: [],
  taxPot: [],
  loaded: false,
};

const $ = (id) => document.getElementById(id);
const CACHE_KEY = 'tml-cache-v1';

// Escape text before putting it into HTML.
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(message, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind === 'error' ? 'error' : ''}`;
  el.textContent = message;
  $('toasts').append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 6000 : 3000);
}

// Opens the sheet with a form. Resolves FormData when the form is submitted
// with a button value of "ok" (or any non cancel value), or null when closed.
export function openDialog(html, onMount) {
  const dlg = $('sheet');
  dlg.innerHTML = `<form method="dialog">${html}</form>`;
  const form = dlg.querySelector('form');
  return new Promise((resolve) => {
    let submitter = null;
    form.addEventListener('submit', (e) => {
      submitter = e.submitter;
      if (submitter && submitter.value !== 'cancel' && !form.checkValidity()) { e.preventDefault(); form.reportValidity(); }
    });
    dlg.addEventListener('close', () => {
      const v = submitter?.value;
      if (!v || v === 'cancel') return resolve(null);
      const fd = new FormData(form);
      fd.set('_action', v);
      resolve(fd);
    }, { once: true });
    onMount?.(form);
    dlg.showModal();
  });
}

// Guard for any change. Keeps the user's input by refusing before saving.
export function canWrite() {
  if (!state.online) { toast('You are offline. Try again when you are back online.', 'error'); return false; }
  if (!state.session) { toast('Please sign in again to save.', 'error'); showLogin(); return false; }
  return true;
}

// Runs a save, shows a toast, refreshes data. Returns true on success.
export async function save(fn, okMessage) {
  if (!canWrite()) return false;
  try {
    await fn();
    if (okMessage) toast(okMessage);
    await reload();
    return true;
  } catch (err) {
    toast(`Not saved: ${err.message}`, 'error');
    return false;
  }
}

function renderNav() {
  const side = SCREENS.map((s) => `<button class="side-link" data-go="${s.id}">${svg(s.icon)}<span>${s.label}</span></button>`).join('');
  const tabs = SCREENS.map((s) => `<button class="tab" data-go="${s.id}">${svg(s.icon)}<span>${s.label}</span></button>`).join('');
  $('side-nav').innerHTML = side;
  $('tabbar').innerHTML = tabs;
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
}

function markNav() {
  document.querySelectorAll('[data-go]').forEach((b) => {
    if (b.dataset.go === state.screen) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
}

export function go(screen, params = '') {
  const target = `#${screen}${params ? `/${params}` : ''}`;
  if (location.hash !== target) location.hash = target;
  else route();
}

const modules = {};
async function loadScreen(id) {
  if (!modules[id]) {
    try { modules[id] = await import(`./screens/${id}.js`); }
    catch { modules[id] = { view: () => `<div class="page-head"><h1 class="page-title">${esc(SCREENS.find((s) => s.id === id)?.label)}</h1></div><div class="empty"><h3>Coming soon</h3><p>This section is being built.</p></div>` }; }
  }
  return modules[id];
}

let lastScreen = '';
export async function render() {
  if (!state.session) return;
  const mod = await loadScreen(state.screen);
  const view = $('view');
  const ctx = { state, store, toast, openDialog, save, go, esc, params: state.params, render };
  view.innerHTML = mod.view(state, ctx);
  if (lastScreen !== state.screen) {
    view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter');
    window.scrollTo(0, 0);
    lastScreen = state.screen;
  }
  mod.mount?.(view, ctx);
  markNav();
  $('side-company').textContent = state.company?.name || 'TML GROUP LTD';
}

function route() {
  const [screen, ...rest] = location.hash.replace('#', '').split('/');
  state.screen = SCREENS.some((s) => s.id === screen) ? screen : 'today';
  state.params = rest.join('/');
  render();
}

function cacheSave() {
  try {
    const { company, deadlines, transactions, rules, taxPot } = state;
    localStorage.setItem(CACHE_KEY, JSON.stringify({ company, deadlines, transactions, rules, taxPot }));
  } catch { /* storage full or blocked: offline copy is optional */ }
}
function cacheLoad() {
  try { Object.assign(state, JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')); } catch { /* ignore */ }
}

export async function reload() {
  if (!state.online || !state.session) return;
  try {
    const [company, deadlines, transactions, rules, taxPot] = await Promise.all([
      store.getCompany(), store.listDeadlines(), store.listTransactions(), store.listRules(), store.listTaxPot(),
    ]);
    Object.assign(state, { company, deadlines, transactions, rules, taxPot, loaded: true });
    // Keep legal deadlines in step with the company dates. Official dates,
    // done flags and notes are never overwritten.
    const rows = legalRows(company);
    const changes = legalChanges(rows, deadlines);
    const orphans = legalOrphans(rows, deadlines, company);
    if (changes.length || orphans.length) {
      await store.deleteLegal(orphans);
      await store.upsertLegal(changes);
      state.deadlines = await store.listDeadlines();
    }
    cacheSave();
  } catch (err) {
    toast(`Could not load data: ${err.message}`, 'error');
  }
  await render();
}

let syncTimer = null;
let stopSync = null;
function startSync() {
  stopSync?.();
  stopSync = store.onChange(() => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(reload, 300);
  });
}

function showLogin() {
  $('frame').hidden = true;
  $('boot').hidden = true;
  const el = $('login');
  el.hidden = false;
  login.mount(el, { store, toast, onSignedIn: () => {} });
}

async function showApp() {
  $('login').hidden = true;
  $('boot').hidden = true;
  $('frame').hidden = false;
  cacheLoad();
  route();
  await reload();
  startSync();
}

function setOnline(v) {
  state.online = v;
  $('offline').hidden = v;
  if (v && state.session) reload();
}

async function boot() {
  renderNav();
  addEventListener('hashchange', route);
  addEventListener('online', () => setOnline(true));
  addEventListener('offline', () => setOnline(false));
  setOnline(navigator.onLine);

  let s = null;
  try { s = await store.session(); } catch { /* offline: fall through */ }
  if (!s && !navigator.onLine && localStorage.getItem(CACHE_KEY)) {
    // Offline with a previous session: read only view from the local copy.
    state.session = { offline: true };
    return showApp();
  }
  state.session = s;
  store.onAuth((session) => {
    const was = !!state.session;
    state.session = session;
    if (session && !was) showApp();
    if (!session && was) { localStorage.removeItem(CACHE_KEY); stopSync?.(); showLogin(); }
  });
  if (s) showApp(); else showLogin();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();
