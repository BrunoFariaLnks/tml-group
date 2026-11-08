// Deadlines: every legal deadline and custom reminder, as a list or a month.
import { buildItems, nextRepeat } from '../model.js';
import { todayLondon, daysBetween, addMonths } from '../dates.js';
import { dateShort, dateLong, countdown, pill, money } from '../format.js';

const ui = { filter: 'all', mode: 'list', month: null };

const PRESETS = [
  [0, 'On time'], [60, '1 hour before'], [1440, '1 day before'], [10080, '1 week before'],
  [20160, '2 weeks before'], [43200, '30 days before'],
];
const REPEATS = [['none', 'Does not repeat'], ['daily', 'Every day'], ['weekly', 'Every week'], ['monthly', 'Every month'], ['yearly', 'Every year']];

export function offsetLabel(m) {
  const p = PRESETS.find(([v]) => v === m);
  if (p) return p[1];
  if (m % 1440 === 0) return `${m / 1440} days before`;
  if (m % 60 === 0) return `${m / 60} hours before`;
  return `${m} minutes before`;
}

const hhmm = (t) => (t || '09:00').slice(0, 5);

function offsetsField(esc, selected) {
  const all = [...new Set([...PRESETS.map(([v]) => v), ...selected])].sort((a, b) => b - a);
  return `<div class="field"><span>Alerts</span>
    <div class="chips" data-offsets>
      ${all.map((v) => `<button type="button" class="chip" data-v="${v}" aria-pressed="${selected.includes(v)}">${esc(offsetLabel(v))}</button>`).join('')}
    </div>
    <div class="custom-offset">
      <input class="input" type="number" min="1" max="999" inputmode="numeric" placeholder="Number" data-co-n>
      <select class="input" data-co-u><option value="1">minutes</option><option value="60">hours</option><option value="1440" selected>days</option></select>
      <button type="button" class="btn small" data-co-add>Add alert</button>
    </div>
    <input type="hidden" name="offsets" value="${selected.join(',')}">
  </div>`;
}

function bindOffsets(form) {
  const box = form.querySelector('[data-offsets]');
  const hidden = form.querySelector('input[name=offsets]');
  const sync = () => { hidden.value = [...box.querySelectorAll('[aria-pressed=true]')].map((c) => c.dataset.v).join(','); };
  box.addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c) return;
    c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); sync();
  });
  form.querySelector('[data-co-add]').addEventListener('click', () => {
    const n = Number(form.querySelector('[data-co-n]').value), u = Number(form.querySelector('[data-co-u]').value);
    if (!(n > 0)) return;
    const v = n * u;
    let c = box.querySelector(`[data-v="${v}"]`);
    if (!c) {
      c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.dataset.v = v; c.textContent = offsetLabel(v);
      box.append(c);
    }
    c.setAttribute('aria-pressed', 'true'); sync();
    form.querySelector('[data-co-n]').value = '';
  });
}

const readOffsets = (fd) => String(fd.get('offsets') || '').split(',').filter(Boolean).map(Number).sort((a, b) => b - a);

// Create or edit a custom reminder. Exported so Today can open it.
export async function editReminder(ctx, item = null) {
  const { esc, openDialog, save, store, state } = ctx;
  const r = item?.row || {};
  const fd = await openDialog(`
    <h2>${item ? 'Edit reminder' : 'New reminder'}</h2>
    <label class="field"><span>What is it?</span><input class="input" name="title" required maxlength="200" value="${esc(r.title || '')}" placeholder="For example, call the accountant"></label>
    <div class="two">
      <label class="field"><span>Date</span><input class="input" type="date" name="due_date" required value="${esc(r.due_date || todayLondon())}"></label>
      <label class="field"><span>Time</span><input class="input" type="time" name="send_time" required value="${hhmm(r.send_time)}"></label>
    </div>
    <label class="field"><span>Repeat</span><select class="input" name="repeat">
      ${REPEATS.map(([v, l]) => `<option value="${v}" ${(r.repeat || 'none') === v ? 'selected' : ''}>${l}</option>`).join('')}
    </select></label>
    ${offsetsField(esc, r.offsets || [1440, 0])}
    <label class="field"><span>Notes</span><textarea class="input" name="notes" rows="3">${esc(r.notes || '')}</textarea></label>
    <div class="sheet-actions">
      ${item ? '<button class="btn danger" value="delete" formnovalidate>Delete</button>' : ''}
      <button class="btn" value="cancel" formnovalidate>Cancel</button>
      <button class="btn primary" value="ok">${item ? 'Save changes' : 'Add reminder'}</button>
    </div>`, bindOffsets);
  if (!fd) return;
  if (fd.get('_action') === 'delete') {
    if (!confirm(`Delete "${r.title}"? This cannot be undone.`)) return;
    await save(() => store.deleteDeadline(r.id), 'Reminder deleted');
    return;
  }
  const row = {
    ...(r.id ? { id: r.id } : { kind: 'custom' }),
    title: String(fd.get('title')).trim(),
    due_date: fd.get('due_date'),
    send_time: fd.get('send_time'),
    repeat: fd.get('repeat'),
    offsets: readOffsets(fd),
    overdue_daily: true,
    notes: String(fd.get('notes') || '').trim() || null,
  };
  await save(() => store.saveDeadline(row), item ? 'Reminder saved' : 'Reminder added');
}

async function editLegal(ctx, item) {
  const { esc, openDialog, save, store } = ctx;
  const r = item.row;
  const fd = await openDialog(`
    <h2>${esc(item.title)}</h2>
    <p class="hint" style="margin:-8px 0 16px">Worked out from your company dates: <strong>${dateLong(r.due_date)}</strong>${item.amountPence ? `. Fee ${money(item.amountPence)}` : ''}.</p>
    <label class="field"><span>Official date (from Companies House or HMRC)</span>
      <input class="input" type="date" name="official_date" value="${esc(r.official_date || '')}">
      <small class="hint">If you enter it, it replaces the worked out date everywhere.</small></label>
    <div class="link-row">
      ${item.guideKey ? `<a class="btn small" href="#guides/${esc(item.guideKey)}">How to do it</a>` : ''}
      ${item.source ? `<a class="btn small" href="${esc(item.source)}" target="_blank" rel="noopener">GOV.UK source</a>` : ''}
    </div>
    <label class="field"><span>Send alerts at</span><input class="input" type="time" name="send_time" required value="${hhmm(r.send_time)}"></label>
    ${offsetsField(esc, r.offsets || [43200, 20160, 10080, 1440, 0])}
    <label class="check"><input type="checkbox" name="overdue_daily" ${r.overdue_daily !== false ? 'checked' : ''}> Remind me every day while it is overdue</label>
    <label class="field"><span>Notes</span><textarea class="input" name="notes" rows="3">${esc(r.notes || '')}</textarea></label>
    <div class="sheet-actions">
      <button class="btn" value="cancel" formnovalidate>Cancel</button>
      <button class="btn" value="toggle" formnovalidate>${r.done ? 'Mark as not done' : 'Mark as done'}</button>
      <button class="btn primary" value="ok">Save</button>
    </div>`, bindOffsets);
  if (!fd) return;
  const patch = {
    id: r.id,
    official_date: fd.get('official_date') || null,
    send_time: fd.get('send_time') || '09:00',
    offsets: readOffsets(fd),
    overdue_daily: fd.get('overdue_daily') === 'on',
    notes: String(fd.get('notes') || '').trim() || null,
  };
  if (fd.get('_action') === 'toggle') {
    patch.done = !r.done; patch.done_at = patch.done ? new Date().toISOString() : null;
    await save(() => store.saveDeadline(patch), patch.done ? 'Marked as done' : 'Marked as not done');
  } else {
    await save(() => store.saveDeadline(patch), 'Saved');
  }
}

export async function openItem(ctx, item) {
  if (!item) return;
  if (item.key === 'approval') return ctx.go('guides', 'approval');
  if (item.kind === 'custom') return editReminder(ctx, item);
  return editLegal(ctx, item);
}

async function markDone(ctx, item) {
  const r = item.row;
  if (item.kind === 'custom' && r.repeat !== 'none' && !r.done) {
    const next = nextRepeat(r.due_date, r.repeat);
    return ctx.save(() => ctx.store.saveDeadline({ id: r.id, due_date: next }), `Done. Next one ${dateShort(next)}`);
  }
  return ctx.save(() => ctx.store.saveDeadline({ id: r.id, done: !r.done, done_at: r.done ? null : new Date().toISOString() }), r.done ? 'Marked as not done' : 'Marked as done');
}

function filtered(items) {
  return items.filter((i) => ({
    all: i.status !== 'done',
    legal: i.kind === 'legal' && i.status !== 'done',
    mine: i.kind === 'custom' && i.status !== 'done',
    done: i.status === 'done',
  }[ui.filter]));
}

function listView(items, today, esc) {
  if (!items.length) {
    return `<div class="empty"><h3>${ui.filter === 'done' ? 'Nothing marked done yet' : 'Nothing here'}</h3>
      <p>${ui.filter === 'mine' ? 'Add a reminder for anything you want a nudge about.' : 'Deadlines appear here once the company dates are added in More.'}</p>
      ${ui.filter === 'mine' ? '<button class="btn primary" data-add>Add reminder</button>' : ''}</div>`;
  }
  return `<ul class="list card list-card">${items.map((i) => `
    <li class="dl-row">
      ${i.id ? `<button class="tick ${i.done ? 'is-done' : ''}" data-done="${esc(i.id)}" aria-label="${i.done ? 'Mark as not done' : 'Mark as done'}: ${esc(i.title)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 12 4 4 8-8"/></svg></button>` : '<span class="tick is-waiting"></span>'}
      <button class="row" data-open="${esc(i.id || i.key)}">
        <span>
          <span class="row-title">${esc(i.title)}</span>
          ${i.kind === 'custom' ? '<span class="tag">Reminder</span>' : ''}
          <br><span class="row-meta">${i.due ? `${dateShort(i.due)}${i.kind === 'custom' ? ` at ${hhmm(i.sendTime)}` : ''}, ${countdown(daysBetween(today, i.due)).toLowerCase()}` : 'Waiting for approval'}${i.officialDate ? ', official date' : ''}${i.repeat && i.repeat !== 'none' ? `, repeats ${i.repeat}` : ''}</span>
        </span>
        ${pill(i.status)}
      </button>
    </li>`).join('')}</ul>`;
}

function monthView(items, today, esc) {
  const ym = ui.month || today.slice(0, 7);
  const first = `${ym}-01`;
  const startDow = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday first
  const days = daysBetween(first, addMonths(first, 1));
  const byDay = {};
  for (const i of items) if (i.due && i.due.startsWith(ym)) (byDay[i.due] ||= []).push(i);
  const title = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${first}T12:00:00Z`));
  let cells = '';
  for (let k = 0; k < startDow; k++) cells += '<div class="cal-cell is-blank"></div>';
  for (let d = 1; d <= days; d++) {
    const date = `${ym}-${String(d).padStart(2, '0')}`;
    const its = byDay[date] || [];
    cells += `<div class="cal-cell ${date === today ? 'is-today' : ''}">
      <span class="cal-day">${d}</span>
      ${its.map((i) => `<button class="cal-item ${i.status}" data-open="${esc(i.id || i.key)}" title="${esc(i.title)}">${esc(i.title)}</button>`).join('')}
    </div>`;
  }
  return `<section class="card cal">
    <div class="chart-head"><h3>${title}</h3>
      <div class="chips"><button class="chip" data-month="-1" aria-label="Previous month">Previous</button><button class="chip" data-month="0">This month</button><button class="chip" data-month="1" aria-label="Next month">Next</button></div></div>
    <div class="cal-grid">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="cal-dow">${d}</div>`).join('')}${cells}</div>
  </section>`;
}

export function view(state, { esc }) {
  const today = todayLondon();
  const items = buildItems(state, today);
  const shown = filtered(items);
  const f = (id, label) => `<button class="chip" data-filter="${id}" aria-pressed="${ui.filter === id}">${label}</button>`;
  return `
  <header class="page-head">
    <div><h1 class="page-title">Deadlines</h1>
      <p class="page-sub">Worked out from your company dates. Check them against your Companies House page and HMRC letters, and add official dates when you have them.</p></div>
    <button class="btn primary" data-add>Add reminder</button>
  </header>
  <div class="toolbar">
    <div class="chips">${f('all', 'All')}${f('legal', 'Legal')}${f('mine', 'My reminders')}${f('done', 'Done')}</div>
    <div class="chips"><button class="chip" data-mode="list" aria-pressed="${ui.mode === 'list'}">List</button><button class="chip" data-mode="month" aria-pressed="${ui.mode === 'month'}">Month</button></div>
  </div>
  ${ui.mode === 'list' ? listView(shown, today, esc) : monthView(ui.filter === 'done' ? shown : items, today, esc)}`;
}

export function mount(root, ctx) {
  const today = todayLondon();
  const items = buildItems(ctx.state, today);
  const find = (k) => items.find((i) => i.id === k || i.key === k);
  root.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { ui.filter = b.dataset.filter; ctx.render(); }));
  root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { ui.mode = b.dataset.mode; ctx.render(); }));
  root.querySelectorAll('[data-month]').forEach((b) => b.addEventListener('click', () => {
    const step = Number(b.dataset.month);
    ui.month = step === 0 ? null : addMonths(`${ui.month || today.slice(0, 7)}-01`, step).slice(0, 7);
    ctx.render();
  }));
  root.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => editReminder(ctx)));
  root.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openItem(ctx, find(b.dataset.open))));
  root.querySelectorAll('[data-done]').forEach((b) => b.addEventListener('click', () => markDone(ctx, find(b.dataset.done))));
  // Opened from a link such as #deadlines/<id>: show that item once.
  if (ctx.params) {
    const it = find(ctx.params);
    history.replaceState(null, '', '#deadlines');
    ctx.state.params = '';
    if (it) openItem(ctx, it);
  }
}
