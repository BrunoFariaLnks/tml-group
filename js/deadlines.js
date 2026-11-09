import { addDays, addMonths, endOfMonth, daysBetween } from './dates.js';

const SRC = {
  approval: 'https://www.gov.uk/limited-company-formation/register-your-company',
  bank: 'https://www.gov.uk/running-a-limited-company',
  cs: 'https://www.gov.uk/file-your-confirmation-statement-with-companies-house',
  accounts: 'https://www.gov.uk/file-your-company-annual-accounts',
  active: 'https://www.gov.uk/corporation-tax',
  ctPay: 'https://www.gov.uk/pay-corporation-tax',
  ctReturn: 'https://www.gov.uk/company-tax-returns',
  sh01: 'https://www.gov.uk/government/publications/return-of-allotment-of-shares-sh01',
  certs: 'https://www.gov.uk/limited-company-formation/shareholders',
  change: 'https://www.gov.uk/running-a-limited-company/company-changes-you-must-report',
};
const YEARS = 3;
const item = (key, title, due, guideKey, source, extra = {}) => ({ key, title, due, guideKey, source, kind: 'legal', ...extra });

export function generateDeadlines(c) {
  if (!c.incorporationDate) return [item('approval', 'Company approval and certificate', null, 'approval', SRC.approval, { waiting: true })];
  const inc = c.incorporationDate, out = [];
  out.push(item('bank', 'Open business bank account', addDays(inc, 30), 'bank', SRC.bank));
  const ards = [c.ardOverride || endOfMonth(addMonths(inc, 12))];
  for (let i = 1; i <= YEARS + 1; i++) ards.push(addMonths(ards[0], 12 * i));
  for (let i = 1; i <= YEARS; i++) {
    const anniv = addMonths(inc, 12 * i);
    // Review period ends the day before the anniversary; file within 14 days of that.
    out.push(item(`cs-${anniv.slice(0, 4)}`, 'Confirmation statement', addDays(anniv, 13), 'cs', SRC.cs, { amountPence: 5000 }));
    out.push(item(`accounts-${i}`, 'Annual accounts to Companies House', i === 1 ? addMonths(inc, 21) : addMonths(ards[i - 1], 9), 'accounts', SRC.accounts, { ard: ards[i - 1] }));
  }
  if (c.tradingStartDate) {
    out.push(item('hmrc-active', 'Tell HMRC the company is active', addMonths(c.tradingStartDate, 3), 'active', SRC.active));
    let start = c.tradingStartDate;
    for (let n = 1; n <= YEARS; n++) {
      const nextArd = ards.find((a) => a >= start);
      const twelve = addDays(addMonths(start, 12), -1);
      const end = nextArd && nextArd < twelve ? nextArd : twelve;
      out.push(item(`ct-pay-${n}`, 'Pay Corporation Tax', addDays(addMonths(end, 9), 1), 'ctPay', SRC.ctPay, { periodStart: start, periodEnd: end }));
      out.push(item(`ct-return-${n}`, 'Company Tax Return (CT600)', addMonths(end, 12), 'ctReturn', SRC.ctReturn, { periodStart: start, periodEnd: end }));
      start = addDays(end, 1);
    }
  }
  if (c.sharesIssuedDate) {
    out.push(item('sh01', 'Report new shares (SH01)', addMonths(c.sharesIssuedDate, 1), 'sh01', SRC.sh01));
    out.push(item('share-certs', 'Issue share certificates', addMonths(c.sharesIssuedDate, 2), 'certs', SRC.certs));
  }
  for (const ch of c.changeLogs || []) out.push(item(`change-${ch.date}-${ch.kind}`, `Report change: ${ch.kind}`, addDays(ch.date, 14), 'change', SRC.change));
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

export const effectiveDue = (d, overrides = {}) => overrides[d.key] || d.due;

export function statusOf(d, today, done, overrides = {}) {
  if (done) return 'done';
  if (d.waiting) return 'waiting';
  const due = effectiveDue(d, overrides), left = daysBetween(today, due);
  return left < 0 ? 'overdue' : left <= 30 ? 'soon' : 'later';
}
