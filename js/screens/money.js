// Money: what came in, what went out, tax estimates and bank statement upload.
import { totals, monthlySeries, accountingPeriod, vatWatch, autoCategory, CATEGORIES, DIVIDENDS } from '../model.js';
import { corporationTax, dividendTax, safeToPayOut } from '../tax.js';
import { parseStatement, withDupKeys, parseCsv } from '../csv.js';
import { todayLondon, addDays } from '../dates.js';
import { money, moneyShort, dateShort, monthName, parsePounds } from '../format.js';
import { areaChart, donut } from '../charts.js';

const ui = { period: 'year', from: '', to: '', q: '' };
const PALETTE = ['#f3500a', '#1b1915', '#f37100', '#8a7f72', '#c85a00', '#d9cfc2', '#5b5bd6', '#1f8f5a', '#cf3b26', '#b8a48c', '#6f6a63', '#ffd27a'];

function range(state, today) {
  const acc = accountingPeriod(state.company, today);
  if (ui.period === 'month') return { from: `${today.slice(0, 7)}-01`, to: today, label: 'This month', days: 30 };
  if (ui.period === 'custom' && ui.from && ui.to) return { from: ui.from, to: ui.to, label: `${dateShort(ui.from)} to ${dateShort(ui.to)}`, days: 365 };
  return { ...acc, label: `${dateShort(acc.from)} to ${dateShort(acc.to)}` };
}

function figures(state, today) {
  const acc = accountingPeriod(state.company, today);
  const t = totals(state.transactions, acc.from, acc.to);
  const ct = corporationTax(t.profitPence, Math.min(acc.days, 365));
  const setAside = (state.taxPot || []).filter((p) => p.date >= acc.from && p.date <= acc.to).reduce((a, p) => a + Number(p.amount_pence), 0);
  const safe = safeToPayOut({ profitPence: t.profitPence, ctPence: ct, dividendsPaidPence: t.dividendsPence });
  return { acc, t, ct, setAside, safe };
}

function txRows(list, esc) {
  if (!list.length) {
    return `<div class="empty"><h3>No transactions yet</h3><p>Upload a bank statement or add one by hand. Amounts are kept in pounds exactly as your bank shows them.</p>
      <button class="btn primary" data-import>Upload bank statement</button></div>`;
  }
  return `<ul class="list">${list.map((x) => `
    <li><button class="row tx-row" data-tx="${esc(x.id)}">
      <span><span class="row-title">${esc(x.description)}</span><br>
        <span class="row-meta">${dateShort(x.date)}${x.category ? `, <span class="cat">${esc(x.category)}</span>` : ', <span class="cat none">Add a category</span>'}</span></span>
      <span class="amt num ${x.amount_pence >= 0 ? 'in' : ''}">${x.amount_pence >= 0 ? '+' : ''}${money(x.amount_pence)}</span>
    </button></li>`).join('')}</ul>`;
}

export function view(state, { esc, params }) {
  const today = todayLondon();
  if (params === 'summary') return summaryView(state, today, esc);
  const r = range(state, today);
  const t = totals(state.transactions, r.from, r.to);
  const f = figures(state, today);
  const vat = vatWatch(state.transactions, today);
  const toMove = Math.max(0, f.ct - f.setAside);
  const series = monthlySeries(state.transactions, today, 12).map((s) => ({ ...s, label: monthName(s.month) }));
  const cats = Object.entries(t.byCategory).sort((a, b) => b[1] - a[1]);
  const parts = cats.map(([label, pence], i) => ({ label, pence, color: PALETTE[i % PALETTE.length] }));
  const q = ui.q.trim().toLowerCase();
  const list = (state.transactions || []).filter((x) => x.date >= r.from && x.date <= r.to)
    .filter((x) => !q || `${x.description} ${x.category || ''}`.toLowerCase().includes(q));
  const p = (id, label) => `<button class="chip" data-period="${id}" aria-pressed="${ui.period === id}">${label}</button>`;
  const hasDividends = (state.transactions || []).some((x) => x.category === DIVIDENDS);

  return `
  <header class="page-head">
    <div><h1 class="page-title">Money</h1><p class="page-sub">${esc(r.label)}</p></div>
    <div class="chips">
      <button class="btn" data-add-tx>Add by hand</button>
      <button class="btn primary" data-import>Upload bank statement</button>
    </div>
  </header>

  <div class="toolbar">
    <div class="chips">${p('year', 'This accounting year')}${p('month', 'This month')}${p('custom', 'Custom')}</div>
    ${ui.period === 'custom' ? `<div class="chips"><input class="input small-in" type="date" data-from value="${esc(ui.from)}" aria-label="From"><input class="input small-in" type="date" data-to value="${esc(ui.to)}" aria-label="To"></div>` : ''}
  </div>

  ${vat.level !== 'none' ? `<div class="banner ${vat.level}"><strong>${vat.level === 'alert' ? 'VAT: you have passed £90,000.' : 'VAT: getting close to £90,000.'}</strong>
    Money in over the last 12 months is ${money(vat.turnoverPence)}. ${vat.level === 'alert' ? 'You must register for VAT within 30 days of the end of the month you went over.' : 'You must register if it goes over £90,000.'}
    <a href="#guides/vat">How VAT registration works</a></div>` : ''}

  <div class="money-cards">
    <section class="card"><div class="label">Money in</div><div class="big">${moneyShort(t.inPence)}</div></section>
    <section class="card"><div class="label">Money out</div><div class="big">${moneyShort(t.outPence)}</div></section>
    <section class="card"><div class="label">Profit <span class="estimate">Estimate</span></div><div class="big">${moneyShort(t.profitPence)}</div><p class="card-sub">Money in minus allowable costs</p></section>
    <section class="card"><div class="label">Safe to pay out <span class="estimate">Estimate</span></div><div class="big">${moneyShort(f.safe)}</div><p class="card-sub">This accounting year, after tax and dividends paid</p></section>
  </div>

  <div class="money-grid">
    <section class="card pot">
      <div class="chart-head"><div><h3>Corporation Tax pot <span class="estimate">Estimate</span></h3><p class="card-sub">This accounting year, ${dateShort(f.acc.from)} to ${dateShort(f.acc.to)}</p></div></div>
      <div class="pot-figs">
        <div><div class="label">Tax so far</div><div class="big">${money(f.ct)}</div></div>
        <div><div class="label">Set aside</div><div class="big">${money(f.setAside)}</div></div>
        <div><div class="label">Still to move</div><div class="big ${toMove ? 'warn-text' : ''}">${money(toMove)}</div></div>
      </div>
      <div class="bar"><span style="width:${f.ct ? Math.min(100, (f.setAside / f.ct) * 100) : 0}%"></span></div>
      <div class="chips"><button class="btn small" data-pot>Record money set aside</button><button class="btn small" data-dividends>Dividend helper</button><a class="btn small" href="#money/summary">Year summary</a></div>
    </section>

    <section class="card">
      <div class="chart-head"><div><h3>Spending</h3><p class="card-sub">${esc(r.label)}</p></div></div>
      <div class="donut-wrap">${donut(parts, 168)}
        <ul class="legend-list">${parts.length ? parts.slice(0, 7).map((x) => `<li><i style="background:${x.color}"></i><span>${esc(x.label)}</span><b class="num">${moneyShort(x.pence)}</b></li>`).join('') : '<li class="hint">No spending in this period.</li>'}</ul>
      </div>
    </section>

    <section class="card wide">
      <div class="chart-head"><div><h3>In and out</h3><p class="card-sub">Last 12 months</p></div>
        <div class="legend"><span><i style="background:#f3500a"></i>In</span><span><i style="background:var(--ink);opacity:.55"></i>Out</span></div></div>
      ${areaChart(series, innerWidth < 900 ? 520 : 1000, innerWidth < 900 ? 240 : 240)}
    </section>
  </div>

  ${hasDividends ? `<div class="banner"><strong>Dividends recorded.</strong> Dividends over £500 in a tax year must be reported to HMRC, and over £10,000 you need personal Self Assessment: register by 5 October after the tax year, then file and pay by 31 January. <a href="#guides/selfAssessment">How it works</a></div>` : ''}

  <section class="card">
    <div class="chart-head"><h3>Transactions</h3>
      <input class="input search" type="search" placeholder="Search" data-q value="${esc(ui.q)}" aria-label="Search transactions"></div>
    ${txRows(list, esc)}
  </section>
  <input type="file" accept=".csv,text/csv" data-file hidden>`;
}

// Year summary for print or PDF.
function summaryView(state, today, esc) {
  const f = figures(state, today);
  const c = state.company || {};
  const tx = (state.transactions || []).filter((x) => x.date >= f.acc.from && x.date <= f.acc.to).sort((a, b) => a.date.localeCompare(b.date));
  const cats = Object.entries(f.t.byCategory).sort((a, b) => b[1] - a[1]);
  return `
  <header class="page-head no-print"><div><h1 class="page-title">Year summary</h1><p class="page-sub">Save as PDF from the print window.</p></div>
    <div class="chips"><a class="btn" href="#money">Back</a><button class="btn primary" data-print>Print or save PDF</button></div></header>
  <article class="summary">
    <h1>${esc(c.name || 'TML GROUP LTD')}</h1>
    <p class="hint">Company number ${esc(c.number || 'not set')}. Accounting year ${dateShort(f.acc.from)} to ${dateShort(f.acc.to)}. Prepared ${dateShort(today)}.</p>
    <table class="tbl">
      <tr><th>Money in</th><td class="num">${money(f.t.inPence)}</td></tr>
      <tr><th>Money out</th><td class="num">${money(f.t.outPence)}</td></tr>
      <tr><th>Allowable costs</th><td class="num">${money(f.t.expensesPence)}</td></tr>
      <tr><th>Profit (estimate)</th><td class="num">${money(f.t.profitPence)}</td></tr>
      <tr><th>Corporation Tax (estimate)</th><td class="num">${money(f.ct)}</td></tr>
      <tr><th>Set aside for tax</th><td class="num">${money(f.setAside)}</td></tr>
      <tr><th>Dividends paid</th><td class="num">${money(f.t.dividendsPence)}</td></tr>
    </table>
    <h2>Money out by category</h2>
    <table class="tbl">${cats.map(([k, v]) => `<tr><th>${esc(k)}</th><td class="num">${money(v)}</td></tr>`).join('') || '<tr><td>None</td></tr>'}</table>
    <h2>Transactions</h2>
    <table class="tbl small"><tr><th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th></tr>
      ${tx.map((x) => `<tr><td>${dateShort(x.date)}</td><td>${esc(x.description)}</td><td>${esc(x.category || '')}</td><td class="num">${money(x.amount_pence)}</td></tr>`).join('')}</table>
    <p class="hint">All tax figures are estimates to help with planning. They are not a tax return.</p>
  </article>`;
}

const catOptions = (sel, esc) => `<option value="">No category</option>${CATEGORIES.map((c) => `<option ${c === sel ? 'selected' : ''}>${esc(c)}</option>`).join('')}`;

async function editTx(ctx, x) {
  const { esc, openDialog, save, store } = ctx;
  const isNew = !x;
  x = x || { date: todayLondon(), description: '', amount_pence: 0, category: '' };
  const fd = await openDialog(`
    <h2>${isNew ? 'Add a transaction' : 'Transaction'}</h2>
    <div class="two">
      <label class="field"><span>Date</span><input class="input" type="date" name="date" required value="${esc(x.date)}"></label>
      <label class="field"><span>Amount in £</span><input class="input" name="amount" required inputmode="decimal" value="${isNew ? '' : (x.amount_pence / 100).toFixed(2)}" placeholder="Use minus for money out, e.g. -45.00"></label>
    </div>
    <label class="field"><span>Description</span><input class="input" name="description" required maxlength="300" value="${esc(x.description)}"></label>
    <label class="field"><span>Category</span><select class="input" name="category">${catOptions(x.category, esc)}</select></label>
    ${isNew ? '' : `<label class="check"><input type="checkbox" name="always"> Always use this category for "${esc(x.description.slice(0, 40))}"</label>`}
    <div class="sheet-actions">
      ${isNew ? '' : '<button class="btn danger" value="delete" formnovalidate>Delete</button>'}
      <button class="btn" value="cancel" formnovalidate>Cancel</button>
      <button class="btn primary" value="ok">${isNew ? 'Add' : 'Save changes'}</button>
    </div>`);
  if (!fd) return;
  if (fd.get('_action') === 'delete') {
    if (!confirm('Delete this transaction? This cannot be undone.')) return;
    return save(() => store.deleteTransaction(x.id), 'Transaction deleted');
  }
  const pence = parsePounds(fd.get('amount'));
  if (pence == null) return ctx.toast('Amount not recognised. Use numbers like 45.00 or -45.00.', 'error');
  const row = { date: fd.get('date'), description: String(fd.get('description')).trim(), amount_pence: pence, category: fd.get('category') || null };
  await save(async () => {
    if (isNew) await store.addTransactions([{ ...row, source: 'manual', dup_key: `manual|${crypto.randomUUID()}` }]);
    else await store.updateTransaction(x.id, row);
    if (fd.get('always') === 'on' && row.category) await store.saveRule(row.description, row.category);
  }, isNew ? 'Transaction added' : 'Saved');
}

async function recordPot(ctx) {
  const fd = await ctx.openDialog(`
    <h2>Record money set aside</h2>
    <p class="hint" style="margin:-8px 0 16px">Use this when you move money into a separate savings pot for Corporation Tax.</p>
    <div class="two">
      <label class="field"><span>Date</span><input class="input" type="date" name="date" required value="${todayLondon()}"></label>
      <label class="field"><span>Amount in £</span><input class="input" name="amount" required inputmode="decimal" placeholder="500.00"></label>
    </div>
    <label class="field"><span>Note</span><input class="input" name="note" maxlength="200"></label>
    <div class="sheet-actions"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary" value="ok">Save</button></div>`);
  if (!fd) return;
  const pence = parsePounds(fd.get('amount'));
  if (pence == null) return ctx.toast('Amount not recognised.', 'error');
  await ctx.save(() => ctx.store.addTaxPot({ date: fd.get('date'), amount_pence: pence, note: fd.get('note') || null }), 'Saved');
}

async function dividendHelper(ctx) {
  const f = figures(ctx.state, todayLondon());
  await ctx.openDialog(`
    <h2>Dividend helper <span class="estimate">Estimate</span></h2>
    <p class="hint" style="margin:-8px 0 16px">Available to pay out this accounting year: <strong>${money(f.safe)}</strong>. This is profit after estimated Corporation Tax and dividends already paid.</p>
    <div class="two">
      <label class="field"><span>Dividend you are thinking of, £</span><input class="input" name="div" inputmode="decimal" placeholder="5000"></label>
      <label class="field"><span>Your other taxable income this tax year, £</span><input class="input" name="other" inputmode="decimal" placeholder="0"></label>
    </div>
    <div class="result" data-result><p class="hint">Enter an amount to see the personal tax estimate.</p></div>
    <p class="hint">Tax year 2026 to 2027 rates: £500 allowance, then 10.75%, 35.75% or 39.35% depending on your band. Dividends can only be paid from profit after tax. Speak to an accountant before paying one.</p>
    <div class="sheet-actions"><button class="btn primary" value="cancel">Close</button></div>`, (form) => {
    const out = form.querySelector('[data-result]');
    const calc = () => {
      const d = parsePounds(form.div.value || '0'), o = parsePounds(form.other.value || '0');
      if (d == null || o == null || d <= 0) { out.innerHTML = '<p class="hint">Enter an amount to see the personal tax estimate.</p>'; return; }
      const tax = dividendTax(d, Math.max(0, o));
      out.innerHTML = `<div class="pot-figs"><div><div class="label">Personal tax</div><div class="big">${money(tax)}</div></div>
        <div><div class="label">You keep</div><div class="big">${money(d - tax)}</div></div></div>
        ${d > f.safe ? '<p class="error-text">This is more than the profit available. The company could not legally pay this.</p>' : ''}`;
    };
    form.addEventListener('input', calc);
  });
}

async function importFlow(ctx, file) {
  const text = await file.text();
  let parsed = parseStatement(text);
  if (parsed.format === 'unknown') {
    const header = (parseCsv(text)[0] || []).map((h) => h.trim()).filter(Boolean);
    if (!header.length) return ctx.toast('That file is empty or not a CSV.', 'error');
    const opts = (name, optional) => `<select class="input" name="${name}">${optional ? '<option value="">None</option>' : ''}${header.map((h) => `<option>${ctx.esc(h)}</option>`).join('')}</select>`;
    const fd = await ctx.openDialog(`
      <h2>Match the columns</h2>
      <p class="hint" style="margin:-8px 0 16px">We didn't recognise this bank's layout. Tell us which column is which. Use either one Amount column, or Paid in and Paid out.</p>
      <label class="field"><span>Date</span>${opts('date')}</label>
      <label class="field"><span>Description</span>${opts('description')}</label>
      <label class="field"><span>Amount</span>${opts('amount', true)}</label>
      <div class="two"><label class="field"><span>Paid in</span>${opts('paidIn', true)}</label><label class="field"><span>Paid out</span>${opts('paidOut', true)}</label></div>
      <div class="sheet-actions"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary" value="ok">Continue</button></div>`);
    if (!fd) return;
    const m = Object.fromEntries(['date', 'description', 'amount', 'paidIn', 'paidOut'].map((k) => [k, fd.get(k) || undefined]));
    if (!m.amount && !(m.paidIn && m.paidOut)) return ctx.toast('Choose an Amount column, or both Paid in and Paid out.', 'error');
    parsed = parseStatement(text, m);
  }
  const keyed = withDupKeys(parsed.rows);
  const have = new Set((ctx.state.transactions || []).map((x) => x.dup_key));
  const fresh = keyed.filter((r) => !have.has(r.dupKey));
  const dupes = keyed.length - fresh.length;
  const preview = fresh.slice(0, 8).map((r) => `<tr><td>${dateShort(r.date)}</td><td>${ctx.esc(r.description)}</td><td class="num">${money(r.amountPence)}</td></tr>`).join('');
  const fd = await ctx.openDialog(`
    <h2>Check before saving</h2>
    <div class="pot-figs">
      <div><div class="label">New</div><div class="big">${fresh.length}</div></div>
      <div><div class="label">Already saved</div><div class="big">${dupes}</div></div>
      <div><div class="label">Unreadable</div><div class="big ${parsed.errors.length ? 'warn-text' : ''}">${parsed.errors.length}</div></div>
    </div>
    ${parsed.errors.length ? `<p class="error-text">Skipped lines: ${parsed.errors.slice(0, 10).map((e) => `line ${e.line} (${e.reason.toLowerCase()})`).join(', ')}${parsed.errors.length > 10 ? ' and more' : ''}.</p>` : ''}
    ${preview ? `<table class="tbl small">${preview}</table>${fresh.length > 8 ? `<p class="hint">And ${fresh.length - 8} more.</p>` : ''}` : '<p class="hint">Nothing new in this file.</p>'}
    <div class="sheet-actions"><button class="btn" value="cancel" formnovalidate>Cancel</button>
      <button class="btn primary" value="ok" ${fresh.length ? '' : 'disabled'}>Save ${fresh.length} transaction${fresh.length === 1 ? '' : 's'}</button></div>`);
  if (!fd) return;
  const rows = fresh.map((r) => ({
    date: r.date, description: r.description, amount_pence: r.amountPence,
    category: autoCategory(r.description, ctx.state.rules), source: 'csv', dup_key: r.dupKey,
  }));
  await ctx.save(async () => {
    for (let i = 0; i < rows.length; i += 500) await ctx.store.addTransactions(rows.slice(i, i + 500));
  }, `${rows.length} transaction${rows.length === 1 ? '' : 's'} saved`);
}

export function mount(root, ctx) {
  const { state } = ctx;
  root.querySelector('[data-print]')?.addEventListener('click', () => window.print());
  if (ctx.params === 'summary') return;
  root.querySelectorAll('[data-period]').forEach((b) => b.addEventListener('click', () => {
    ui.period = b.dataset.period;
    if (ui.period === 'custom' && !ui.from) { ui.to = todayLondon(); ui.from = addDays(ui.to, -89); }
    ctx.render();
  }));
  root.querySelector('[data-from]')?.addEventListener('change', (e) => { ui.from = e.target.value; ctx.render(); });
  root.querySelector('[data-to]')?.addEventListener('change', (e) => { ui.to = e.target.value; ctx.render(); });
  const q = root.querySelector('[data-q]');
  q?.addEventListener('input', () => {
    ui.q = q.value;
    const pos = q.selectionStart;
    ctx.render().then(() => { const n = document.querySelector('[data-q]'); n?.focus(); n?.setSelectionRange(pos, pos); });
  });
  const file = root.querySelector('[data-file]');
  root.querySelectorAll('[data-import]').forEach((b) => b.addEventListener('click', () => { if (ctx.state.online) file.click(); else ctx.toast('You are offline.', 'error'); }));
  file.addEventListener('change', () => { const f = file.files[0]; file.value = ''; if (f) importFlow(ctx, f); });
  root.querySelector('[data-add-tx]')?.addEventListener('click', () => editTx(ctx));
  root.querySelector('[data-pot]')?.addEventListener('click', () => recordPot(ctx));
  root.querySelector('[data-dividends]')?.addEventListener('click', () => dividendHelper(ctx));
  root.querySelectorAll('[data-tx]').forEach((b) => b.addEventListener('click', () => editTx(ctx, state.transactions.find((x) => x.id === b.dataset.tx))));
  if (ctx.params === 'import') { history.replaceState(null, '', '#money'); ctx.state.params = ''; file.click(); }
}
