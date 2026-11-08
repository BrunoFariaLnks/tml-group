// Today: where things stand and what is next.
import { buildItems, nextItem, overallStatus, totals, monthlySeries, accountingPeriod } from '../model.js';
import { corporationTax } from '../tax.js';
import { todayLondon, daysBetween, addDays } from '../dates.js';
import { money, moneyShort, dateLong, dateShort, countdown, pill, monthName } from '../format.js';
import { sparkline, areaChart, ring } from '../charts.js';

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hour12: false }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function hero(item, today, esc) {
  if (!item) {
    return `<section class="hero"><div><div class="hero-label">Next deadline</div><h2 class="hero-title">Nothing due</h2></div>
      <p style="margin:0;color:rgba(255,255,255,.7)">Add the company dates in More to load every legal deadline.</p></section>`;
  }
  if (item.status === 'waiting') {
    return `<section class="hero">
      <div><div class="hero-label">Waiting on Companies House</div><h2 class="hero-title">${esc(item.title)}</h2></div>
      <div class="hero-count">Waiting</div>
      <p style="margin:0;color:rgba(255,255,255,.72);max-width:46ch">When the certificate arrives, add the incorporation date in More. Every legal deadline then appears here automatically.</p>
      <div><button class="btn accent" data-go-more>Add company dates</button></div>
    </section>`;
  }
  const left = daysBetween(today, item.due);
  const overdue = left < 0;
  const big = overdue ? -left : left;
  const unit = left === 0 ? 'today' : `${big === 1 ? 'day' : 'days'}${overdue ? ' late' : ''}`;
  return `<section class="hero ${overdue ? 'is-overdue' : ''}">
    <div class="hero-top">
      <div>
        <div class="hero-label">${overdue ? 'Overdue' : 'Next deadline'}</div>
        <h2 class="hero-title">${esc(item.title)}</h2>
        <div class="hero-date">${dateLong(item.due)}${item.amountPence ? `, fee ${money(item.amountPence)}` : ''}</div>
      </div>
      ${ring(left, 30, 96, overdue ? '#ff6a52' : '#ffb020')}
    </div>
    <div class="hero-count num">${left === 0 ? 'Today' : big}<small>${left === 0 ? '' : unit}</small></div>
    <div class="hero-actions">
      <button class="btn accent" data-open="${esc(item.id || item.key)}">Open</button>
      ${item.guideKey ? `<a class="btn ghost" href="#guides/${esc(item.guideKey)}">How to do it</a>` : ''}
    </div>
  </section>`;
}

export function view(state, { esc }) {
  const today = todayLondon();
  const items = buildItems(state, today);
  const next = nextItem(items);
  const st = overallStatus(items);
  const period = accountingPeriod(state.company, today);
  const t = totals(state.transactions, period.from, period.to);
  const ct = corporationTax(t.profitPence, Math.min(period.days, 365));
  const setAside = (state.taxPot || []).filter((p) => p.date >= period.from && p.date <= period.to).reduce((a, p) => a + Number(p.amount_pence), 0);
  const toMove = Math.max(0, ct - setAside);
  const series = monthlySeries(state.transactions, today, 12);
  const six = series.slice(-6);

  const statusLine = st.overdue
    ? `<span class="status-dot overdue"></span>${st.overdue} overdue. Deal with ${st.overdue === 1 ? 'it' : 'them'} first.`
    : st.soon
      ? `<span class="status-dot soon"></span>You're on track. ${st.soon} due in the next 30 days.`
      : `<span class="status-dot done"></span>You're on track. Nothing due in the next 30 days.`;

  const lastCsv = (state.transactions || []).filter((x) => x.source === 'csv').map((x) => x.created_at?.slice(0, 10)).sort().pop();
  const nudge = state.company?.trading_start_date && (!lastCsv || lastCsv < addDays(today, -30));

  const upcoming = items.filter((i) => i.status !== 'done').slice(0, 5);
  const rows = upcoming.map((i) => `
    <li><button class="row" data-open="${esc(i.id || i.key)}">
      <span><span class="row-title">${esc(i.title)}</span><br><span class="row-meta">${i.due ? `${dateShort(i.due)}, ${countdown(daysBetween(today, i.due)).toLowerCase()}` : 'Waiting for approval'}</span></span>
      ${pill(i.status)}
    </button></li>`).join('');

  return `
  <header class="page-head">
    <div>
      <h1 class="page-title">${greeting()}, Bruno</h1>
      <p class="page-sub status-line">${statusLine}</p>
    </div>
    <button class="btn primary" data-add-reminder>Add reminder</button>
  </header>

  ${nudge ? `<div class="nudge">No bank statement uploaded for 30 days. <a href="#money/import">Upload one now</a> so the numbers stay right.</div>` : ''}

  <div class="today-grid">
    <div class="t-hero">${hero(next, today, esc)}</div>

    <div class="t-kpis">
      <section class="card kpi">
        <div><div class="label">Money in</div><div class="big">${moneyShort(t.inPence)}</div><div class="card-sub">This accounting year</div></div>
        ${sparkline(six.map((s) => s.inPence))}
      </section>
      <section class="card kpi">
        <div><div class="label">Profit <span class="estimate">Estimate</span></div><div class="big">${moneyShort(t.profitPence)}</div><div class="card-sub">After allowable costs</div></div>
        ${sparkline(six.map((s) => s.inPence - s.outPence), 120, 36, 'var(--ink)')}
      </section>
    </div>

    <section class="card t-tax">
      <div class="label">Tax to set aside <span class="estimate">Estimate</span></div>
      <div class="big">${money(toMove)}</div>
      <div class="bar" role="img" aria-label="Set aside ${money(setAside)} of ${money(ct)}"><span style="width:${ct ? Math.min(100, (setAside / ct) * 100) : 0}%"></span></div>
      <p class="card-sub">Corporation Tax so far ${money(ct)}. Already set aside ${money(setAside)}.</p>
      <a class="btn small" href="#money">See money</a>
    </section>

    <section class="card t-chart">
      <div class="chart-head"><div><h3>Money over time</h3><p class="card-sub">Last 12 months</p></div>
        <div class="legend"><span><i style="background:#f08a00"></i>In</span><span><i style="background:var(--ink);opacity:.55"></i>Out</span></div></div>
      ${areaChart(series.map((s) => ({ ...s, label: monthName(s.month) })))}
    </section>

    <section class="card t-list">
      <div class="chart-head"><h3>Coming up</h3><a class="btn small" href="#deadlines">All deadlines</a></div>
      ${rows ? `<ul class="list">${rows}</ul>` : '<p class="card-sub">Nothing open. Well done.</p>'}
    </section>
  </div>`;
}

export function mount(root, ctx) {
  root.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.open;
    if (k === 'approval') ctx.go('guides', 'approval'); else ctx.go('deadlines', k);
  }));
  root.querySelector('[data-go-more]')?.addEventListener('click', () => ctx.go('more'));
  root.querySelector('[data-add-reminder]')?.addEventListener('click', async () => {
    const m = await import('./deadlines.js').catch(() => null);
    if (m?.editReminder) m.editReminder(ctx); else ctx.go('deadlines');
  });
}
