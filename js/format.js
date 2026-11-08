// Display helpers. Dates stay YYYY-MM-DD strings; we format at UTC noon.
const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const gbp0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
export const money = (pence) => gbp.format((Number(pence) || 0) / 100);
export const moneyShort = (pence) => gbp0.format(Math.round((Number(pence) || 0) / 100));

const at = (d) => new Date(`${d}T12:00:00Z`);
const fmt = (opts) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts });
export const dateLong = (d) => (d ? fmt({ weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(at(d)) : 'Date not set');
export const dateShort = (d) => (d ? fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(at(d)) : 'Not set');
export const monthName = (ym) => fmt({ month: 'short' }).format(at(`${ym}-01`));

export function countdown(days) {
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`;
  return `In ${days} days`;
}

export const STATUS_LABEL = { done: 'Done', soon: 'Due soon', overdue: 'Overdue', waiting: 'Waiting', later: 'Later' };
export const pill = (status) => `<span class="pill ${status}">${STATUS_LABEL[status]}</span>`;

// Pence from a typed amount like "1,234.56" or "£45". Returns null if unreadable.
export function parsePounds(text) {
  const s = String(text ?? '').replace(/[£,\s]/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  const neg = s.startsWith('-');
  const [w, f = ''] = s.replace('-', '').split('.');
  const p = Number(w) * 100 + Number((f + '00').slice(0, 2));
  return neg ? -p : p;
}
