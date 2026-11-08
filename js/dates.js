// Plain YYYY-MM-DD dates, London calendar. UTC noon internally so BST never shifts a day.
const parse = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd, 12)); };
const fmt = (dt) => dt.toISOString().slice(0, 10);
const lastDay = (y, m) => new Date(Date.UTC(y, m + 1, 0, 12)).getUTCDate();

export const addDays = (d, n) => { const t = parse(d); t.setUTCDate(t.getUTCDate() + n); return fmt(t); };
export const isEndOfMonth = (d) => { const t = parse(d); return t.getUTCDate() === lastDay(t.getUTCFullYear(), t.getUTCMonth()); };
export const endOfMonth = (d) => { const t = parse(d); return fmt(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), lastDay(t.getUTCFullYear(), t.getUTCMonth()), 12))); };
export function addMonths(d, n) {
  const t = parse(d), y = t.getUTCFullYear(), m = t.getUTCMonth() + n;
  const ty = y + Math.floor(m / 12), tm = ((m % 12) + 12) % 12, max = lastDay(ty, tm);
  const day = isEndOfMonth(d) ? max : Math.min(t.getUTCDate(), max);
  return fmt(new Date(Date.UTC(ty, tm, day, 12)));
}
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
export const todayLondon = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now);
