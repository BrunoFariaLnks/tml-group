// Bank statement CSV parsing. Amounts in pence, dates YYYY-MM-DD.
export function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((c) => c !== '')) rows.push(row); }
  return rows;
}

const toPence = (s) => {
  if (s == null) return null;
  let t = String(s).trim().replace(/[£,\s]/g, '');
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(t)) return NaN;
  const v = Math.round(parseFloat(t) * 100);
  return neg ? -v : v;
};
const toDate = (s) => {
  const t = String(s || '').trim();
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : (t.match(/^\d{4}-\d{2}-\d{2}/) || [])[0];
  if (!iso) return null;
  const d = new Date(iso + 'T12:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === iso ? iso : null;
};
const find = (h, re) => h.findIndex((x) => re.test(x.trim()));

function detect(h) {
  const date = find(h, /^date$/i) >= 0 ? find(h, /^date$/i) : find(h, /date/i);
  const desc = [/^name$/i, /counter ?party/i, /^description$/i, /reference/i].map((re) => find(h, re)).filter((i) => i >= 0);
  const amount = find(h, /^amount/i);
  const paidIn = find(h, /paid in|money in/i), paidOut = find(h, /paid out|money out/i);
  if (date < 0 || !desc.length || (amount < 0 && (paidIn < 0 || paidOut < 0))) return null;
  return { date, desc, amount, paidIn, paidOut };
}

export function parseStatement(text, mapping) {
  const all = parseCsv(text);
  if (!all.length) return { rows: [], errors: [], format: 'unknown' };
  const h = all[0].map((x) => x.trim());
  let cols, format;
  if (mapping) {
    const ix = (n) => (n ? h.indexOf(n) : -1);
    cols = { date: ix(mapping.date), desc: [ix(mapping.description)], amount: ix(mapping.amount), paidIn: ix(mapping.paidIn), paidOut: ix(mapping.paidOut) };
    format = 'mapped';
  } else {
    cols = detect(h);
    if (!cols) return { rows: [], errors: [], format: 'unknown' };
    format = h.includes('Emoji') && h.includes('Transaction ID') ? 'monzo' : find(h, /counter ?party/i) >= 0 ? 'starling'
      : cols.amount < 0 && cols.paidIn >= 0 ? 'tide' : 'generic';
  }
  const rows = [], errors = [];
  all.slice(1).forEach((r, i) => {
    const line = i + 2;
    const date = toDate(r[cols.date]);
    const description = (cols.desc.map((c) => (r[c] || '').trim()).find(Boolean)) || '';
    let amountPence;
    if (cols.amount >= 0) amountPence = toPence(r[cols.amount]);
    else {
      const pin = toPence(r[cols.paidIn]), pout = toPence(r[cols.paidOut]);
      amountPence = pin ? Math.abs(pin) : pout ? -Math.abs(pout) : pin === 0 || pout === 0 ? 0 : null;
      if (Number.isNaN(pin) || Number.isNaN(pout)) amountPence = NaN;
    }
    if (!date) return errors.push({ line, reason: 'Date not recognised' });
    if (amountPence == null || Number.isNaN(amountPence)) return errors.push({ line, reason: 'Amount not recognised' });
    rows.push({ date, description, amountPence });
  });
  return { rows, errors, format };
}

export const dupKey = (r) => `${r.date}|${r.amountPence}|${r.description.trim().toLowerCase()}`;

// Adds dupKey to each row. A repeat of the same line within one file gets a
// counter, so real twin payments both survive while re-uploading a file
// (or an overlapping one, in the same order) adds nothing new.
export function withDupKeys(rows) {
  const seen = {};
  return rows.map((r) => {
    const k = dupKey(r);
    seen[k] = (seen[k] || 0) + 1;
    return { ...r, dupKey: seen[k] === 1 ? k : `${k}|${seen[k]}` };
  });
}
