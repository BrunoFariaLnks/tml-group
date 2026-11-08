// Turns database rows into what the screens show. Pure functions, tested.
import { generateDeadlines, statusOf } from './deadlines.js';
import { addDays, addMonths, daysBetween } from './dates.js';

export function companyInput(c) {
  return {
    incorporationDate: c?.incorporation_date || null,
    tradingStartDate: c?.trading_start_date || null,
    ardOverride: c?.ard_override || null,
    sharesIssuedDate: c?.shares_issued_date || null,
    changeLogs: c?.change_logs || [],
  };
}

// Legal deadlines as database rows. The waiting approval item is never stored.
export function legalRows(company) {
  if (!company?.incorporation_date) return [];
  return generateDeadlines(companyInput(company)).filter((d) => !d.waiting).map((d) => ({
    kind: 'legal',
    rule_key: d.key,
    title: d.title,
    due_date: d.due,
    guide_key: d.guideKey,
    source: d.source,
    amount_pence: d.amountPence ?? null,
  }));
}

// Rows to upsert: new or changed calculated fields only. Official dates,
// done flags, notes and alert settings are never sent, so they are kept.
const FIELDS = ['title', 'due_date', 'guide_key', 'source', 'amount_pence'];
export function legalChanges(rows, existing) {
  const byKey = new Map(existing.filter((e) => e.kind === 'legal').map((e) => [e.rule_key, e]));
  return rows.filter((r) => {
    const e = byKey.get(r.rule_key);
    return !e || FIELDS.some((f) => (e[f] ?? null) !== (r[f] ?? null));
  });
}

const APPROVAL = {
  id: null, key: 'approval', kind: 'legal', title: 'Company approval and certificate', due: null,
  guideKey: 'approval', source: 'https://www.gov.uk/limited-company-formation/register-your-company',
  status: 'waiting', done: false, amountPence: null,
};

// Every deadline and reminder, with its effective date and status.
export function buildItems({ company, deadlines }, today) {
  const items = (deadlines || []).map((d) => {
    const due = d.official_date || d.due_date;
    return {
      id: d.id, key: d.rule_key || d.id, kind: d.kind, title: d.title, due,
      calculatedDue: d.due_date, officialDate: d.official_date || null,
      guideKey: d.guide_key, source: d.source, notes: d.notes, done: !!d.done,
      amountPence: d.amount_pence ?? null, sendTime: d.send_time, offsets: d.offsets,
      repeat: d.repeat, row: d,
      status: statusOf({ due }, today, !!d.done),
    };
  });
  if (!company?.incorporation_date) items.unshift({ ...APPROVAL });
  const rank = (i) => (i.status === 'waiting' ? 0 : 1);
  return items.sort((a, b) => rank(a) - rank(b) || (a.due || '').localeCompare(b.due || ''));
}

// The most urgent open item: overdue first, then the nearest date, then waiting.
export function nextItem(items) {
  const open = items.filter((i) => i.status !== 'done' && i.due);
  return open[0] || items.find((i) => i.status === 'waiting') || null;
}

export function overallStatus(items) {
  const count = (s) => items.filter((i) => i.status === s).length;
  return { overdue: count('overdue'), soon: count('soon'), waiting: count('waiting') };
}

const NOT_EXPENSE = new Set(['Dividends paid', 'Not tax deductible', 'Tax payments']);
export const DIVIDENDS = 'Dividends paid';

// Totals in pence for a date range (inclusive). Expenses exclude dividends,
// non deductible items and tax payments, so profit is the taxable estimate.
export function totals(transactions, from, to) {
  let inPence = 0, outPence = 0, expensesPence = 0, dividendsPence = 0;
  const byCategory = {};
  for (const t of transactions || []) {
    if ((from && t.date < from) || (to && t.date > to)) continue;
    const a = Number(t.amount_pence);
    if (a >= 0) inPence += a;
    else {
      const out = -a;
      outPence += out;
      const cat = t.category || 'Uncategorised';
      byCategory[cat] = (byCategory[cat] || 0) + out;
      if (cat === DIVIDENDS) dividendsPence += out;
      if (!NOT_EXPENSE.has(cat)) expensesPence += out;
    }
  }
  return { inPence, outPence, expensesPence, dividendsPence, profitPence: inPence - expensesPence, byCategory };
}

// One point per calendar month, oldest first, ending with today's month.
export function monthlySeries(transactions, today, months = 12) {
  const keys = [];
  for (let i = months - 1; i >= 0; i--) keys.push(addMonths(`${today.slice(0, 7)}-01`, -i).slice(0, 7));
  const map = Object.fromEntries(keys.map((k) => [k, { month: k, inPence: 0, outPence: 0 }]));
  for (const t of transactions || []) {
    const m = map[t.date.slice(0, 7)];
    if (!m) continue;
    const a = Number(t.amount_pence);
    if (a >= 0) m.inPence += a; else m.outPence += -a;
  }
  return keys.map((k) => map[k]);
}

// The period used for "this accounting year": the Corporation Tax period that
// contains today once trading, otherwise the first accounts period, otherwise
// the calendar year.
export function accountingPeriod(company, today) {
  const span = (from, to) => ({ from, to, days: daysBetween(from, to) + 1 });
  if (!company?.incorporation_date) return span(`${today.slice(0, 4)}-01-01`, `${today.slice(0, 4)}-12-31`);
  const all = generateDeadlines(companyInput(company));
  const ct = all.filter((d) => d.periodStart && d.key.startsWith('ct-pay'));
  const hit = ct.find((d) => d.periodStart <= today && today <= d.periodEnd);
  if (hit) return span(hit.periodStart, hit.periodEnd);
  if (ct.length && today > ct[ct.length - 1].periodEnd) { const last = ct[ct.length - 1]; return span(last.periodStart, last.periodEnd); }
  const acc = all.find((d) => d.key === 'accounts-1');
  return span(company.incorporation_date, acc.ard);
}

export const nextRepeat = (date, repeat) => ({
  daily: () => addDays(date, 1),
  weekly: () => addDays(date, 7),
  monthly: () => addMonths(date, 1),
  yearly: () => addMonths(date, 12),
}[repeat]?.() ?? null);

// VAT: money in over the last 12 months against the £90,000 threshold.
export const VAT_THRESHOLD = 9_000_000;
export const VAT_WARN = 7_500_000;
export function vatWatch(transactions, today) {
  const from = addDays(addMonths(today, -12), 1);
  const turnoverPence = (transactions || []).filter((t) => t.date >= from && t.date <= today && Number(t.amount_pence) > 0)
    .reduce((a, t) => a + Number(t.amount_pence), 0);
  const level = turnoverPence > VAT_THRESHOLD ? 'alert' : turnoverPence >= VAT_WARN ? 'warn' : 'none';
  return { turnoverPence, level, from };
}

export function autoCategory(description, rules) {
  const d = String(description || '').toLowerCase();
  const hit = (rules || []).filter((r) => d.includes(r.pattern)).sort((a, b) => b.pattern.length - a.pattern.length)[0];
  return hit ? hit.category : null;
}

export const CATEGORIES = [
  'Ad income', 'Other income', 'Content and licences', 'Tech and hosting', 'Equipment', 'Marketing',
  'Travel', 'Professional fees', 'Bank fees', 'Tax payments', 'Dividends paid', 'Not tax deductible',
];

// Legal rows that the current company dates no longer produce (for example
// after correcting the incorporation date). Only checked once dates exist.
export function legalOrphans(rows, existing, company) {
  if (!company?.incorporation_date) return [];
  const keys = new Set(rows.map((r) => r.rule_key));
  return (existing || []).filter((e) => e.kind === 'legal' && !keys.has(e.rule_key)).map((e) => e.id);
}
