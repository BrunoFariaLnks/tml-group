// More: company details and dates, notifications, categories, export, sign out.
import { pushState, enablePush, disablePush, sendTest } from '../push.js';
import { dateShort } from '../format.js';
import { todayLondon } from '../dates.js';

const CHANGE_KINDS = ['Director', 'Person with significant control', 'Registered office', 'Shares or shareholders', 'Other'];

function field(name, label, value, esc, type = 'text', extra = '') {
  return `<label class="field"><span>${label}</span><input class="input" type="${type}" name="${name}" value="${esc(value || '')}" ${extra}></label>`;
}

export function view(state, { esc }) {
  const c = state.company || {};
  const logs = c.change_logs || [];
  const push = pushState();
  return `
  <header class="page-head"><div><h1 class="page-title">More</h1><p class="page-sub">Company details, dates, notifications and settings.</p></div></header>
  <div class="more-grid">
    <section class="card">
      <h3>Company dates</h3>
      <p class="card-sub" style="margin-bottom:14px">These work out every legal deadline. Leave a date empty until you have it.</p>
      <form data-form="dates">
        ${field('incorporation_date', 'Incorporation date (on the certificate)', c.incorporation_date, esc, 'date')}
        ${field('trading_start_date', 'Date trading started (leave empty if not yet)', c.trading_start_date, esc, 'date')}
        ${field('ard_override', 'Accounting reference date, only if you changed it', c.ard_override, esc, 'date')}
        ${field('shares_issued_date', 'Date new shares were last issued', c.shares_issued_date, esc, 'date')}
        <button class="btn primary">Save dates</button>
      </form>
    </section>

    <section class="card">
      <h3>Company details</h3>
      <form data-form="details" style="margin-top:12px">
        ${field('name', 'Company name', c.name || 'TML GROUP LTD', esc)}
        ${field('number', 'Company number', c.number, esc, 'text', 'inputmode="numeric" maxlength="8"')}
        ${field('registered_office', 'Registered office', c.registered_office, esc)}
        ${field('sic', 'SIC code', c.sic || '60200', esc)}
        ${field('email', 'Company email', c.email, esc, 'email')}
        ${field('director', 'Director', c.director, esc)}
        <button class="btn primary">Save details</button>
      </form>
    </section>

    <section class="card">
      <h3>Notifications</h3>
      <p class="card-sub" style="margin-bottom:12px">${esc(push.message)}</p>
      <div class="chips">
        ${push.subscribed ? '<button class="btn" data-push-off>Turn off on this device</button><button class="btn primary" data-push-test>Send a test</button>'
          : `<button class="btn primary" data-push-on ${push.supported ? '' : 'disabled'}>Turn on for this device</button>`}
      </div>
      ${push.help ? `<ol class="steps" style="margin-top:16px">${push.help.map((h) => `<li>${esc(h)}</li>`).join('')}</ol>` : ''}
      <p class="hint" style="margin-top:14px">Turn it on once on the laptop and once on the iPhone. Legal deadlines alert 30, 14, 7 and 1 days before, on the day, and every day while overdue, at 9:00. Change these per deadline.</p>
    </section>

    <section class="card">
      <h3>Report a company change</h3>
      <p class="card-sub" style="margin-bottom:12px">Log a change and the app adds a deadline 14 days later to report it.</p>
      <form data-form="change">
        <div class="two">
          <label class="field"><span>What changed</span><select class="input" name="kind">${CHANGE_KINDS.map((k) => `<option>${k}</option>`).join('')}</select></label>
          ${field('date', 'Date of change', todayLondon(), esc, 'date', 'required')}
        </div>
        <button class="btn">Log change</button>
      </form>
      ${logs.length ? `<div style="margin-top:12px">${logs.map((l, i) => `<div class="kv"><span>${esc(l.kind)}, ${dateShort(l.date)}</span><button class="btn small" data-unlog="${i}">Remove</button></div>`).join('')}</div>` : ''}
    </section>

    <section class="card">
      <h3>Auto tagging</h3>
      <p class="card-sub" style="margin-bottom:8px">Descriptions you told the app to always tag. Tick "Always use this category" on any transaction to add one.</p>
      ${(state.rules || []).length ? state.rules.map((r) => `<div class="kv"><span><strong>${esc(r.pattern)}</strong> becomes ${esc(r.category)}</span><button class="btn small" data-rule="${esc(r.id)}">Remove</button></div>`).join('') : '<p class="hint">No rules yet.</p>'}
    </section>

    <section class="card">
      <h3>Your data</h3>
      <p class="card-sub" style="margin-bottom:12px">Download everything as CSV files you can open in Excel.</p>
      <div class="chips"><button class="btn" data-export="transactions">Export transactions</button><button class="btn" data-export="deadlines">Export deadlines</button></div>
      <hr class="sep">
      <p class="card-sub" style="margin-bottom:12px">Signed in as ${esc(state.session?.user?.email || '')}.</p>
      <button class="btn danger" data-signout>Sign out</button>
    </section>
  </div>`;
}

function csvOf(rows, cols) {
  const q = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => q(c === 'amount' ? (r.amount_pence / 100).toFixed(2) : r[c])).join(','))].join('\r\n');
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function mount(root, ctx) {
  const { state, store, save, toast } = ctx;
  const form = (name, fn) => root.querySelector(`[data-form="${name}"]`)?.addEventListener('submit', (e) => { e.preventDefault(); fn(new FormData(e.target)); });

  form('dates', (fd) => {
    const patch = Object.fromEntries(['incorporation_date', 'trading_start_date', 'ard_override', 'shares_issued_date'].map((k) => [k, fd.get(k) || null]));
    if (patch.trading_start_date && patch.incorporation_date && patch.trading_start_date < patch.incorporation_date) return toast('Trading cannot start before incorporation.', 'error');
    save(() => store.saveCompany(patch), 'Dates saved. Deadlines updated.');
  });
  form('details', (fd) => {
    const patch = Object.fromEntries(['name', 'number', 'registered_office', 'sic', 'email', 'director'].map((k) => [k, String(fd.get(k) || '').trim() || null]));
    if (patch.number && !/^[A-Z0-9]{8}$/i.test(patch.number)) return toast('A company number has 8 characters, for example 17012345.', 'error');
    save(() => store.saveCompany(patch), 'Details saved');
  });
  form('change', (fd) => {
    const logs = [...(state.company?.change_logs || []), { kind: fd.get('kind'), date: fd.get('date') }];
    save(() => store.saveCompany({ change_logs: logs }), 'Change logged. Deadline added.');
  });
  root.querySelectorAll('[data-unlog]').forEach((b) => b.addEventListener('click', () => {
    const logs = (state.company?.change_logs || []).filter((_, i) => i !== Number(b.dataset.unlog));
    save(() => store.saveCompany({ change_logs: logs }), 'Removed');
  }));
  root.querySelectorAll('[data-rule]').forEach((b) => b.addEventListener('click', () => save(() => store.deleteRule(b.dataset.rule), 'Rule removed')));
  root.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => {
    const today = todayLondon();
    if (b.dataset.export === 'transactions') download(`tml-transactions-${today}.csv`, csvOf(state.transactions || [], ['date', 'description', 'amount', 'category', 'source']));
    else download(`tml-deadlines-${today}.csv`, csvOf(state.deadlines || [], ['title', 'kind', 'due_date', 'official_date', 'done', 'send_time', 'repeat', 'notes']));
  }));
  root.querySelector('[data-signout]')?.addEventListener('click', async () => {
    if (!confirm('Sign out of TML Group on this device?')) return;
    try { await disablePush(store, true); } catch { /* not subscribed */ }
    await store.signOut();
  });
  root.querySelector('[data-push-on]')?.addEventListener('click', async () => {
    try { await enablePush(store); toast('Notifications are on for this device'); ctx.render(); } catch (e) { toast(e.message, 'error'); ctx.render(); }
  });
  root.querySelector('[data-push-off]')?.addEventListener('click', async () => {
    try { await disablePush(store); toast('Notifications are off for this device'); ctx.render(); } catch (e) { toast(e.message, 'error'); }
  });
  root.querySelector('[data-push-test]')?.addEventListener('click', async () => {
    try { await sendTest(store); toast('Test sent. It should arrive in a few seconds.'); } catch (e) { toast(e.message, 'error'); }
  });
}
