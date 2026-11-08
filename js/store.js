// Data access for the TML app. Rows keep their database (snake_case) fields.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
});

function must({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// Auth: 6 digit email code
export async function sendCode(email) {
  const home = location.origin + location.pathname.replace(/index\.html$/, '');
  must(await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: home } }));
}
export async function verifyCode(email, code) {
  return must(await sb.auth.verifyOtp({ email, token: String(code).trim(), type: 'email' })).session;
}
// Sign in from a pasted email link (iPhone: links open Safari, not the app).
export async function verifyLink(link) {
  let u;
  try { u = new URL(String(link).trim()); } catch { throw new Error('That is not a link. Copy the whole link from the email.'); }
  const hash = new URLSearchParams(u.hash.replace(/^#/, ''));
  if (hash.get('access_token') && hash.get('refresh_token')) {
    return must(await sb.auth.setSession({ access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token') })).session;
  }
  const token = u.searchParams.get('token') || u.searchParams.get('token_hash');
  const type = u.searchParams.get('type') || 'magiclink';
  if (!token) throw new Error('That link has no sign in code in it. Copy the link from the newest email.');
  return must(await sb.auth.verifyOtp({ token_hash: token, type: type === 'signup' ? 'signup' : 'magiclink' })).session;
}
export async function signOut() { must(await sb.auth.signOut()); }
export async function session() { return must(await sb.auth.getSession()).session; }
export function onAuth(cb) { return sb.auth.onAuthStateChange((_e, s) => cb(s)); }

// Company (one row)
export async function getCompany() {
  return must(await sb.from('company').select('*').maybeSingle());
}
export async function saveCompany(patch) {
  const current = await getCompany();
  const q = current
    ? sb.from('company').update(patch).eq('id', current.id)
    : sb.from('company').insert(patch);
  return must(await q.select().single());
}

// Deadlines and reminders
export async function listDeadlines() {
  return must(await sb.from('deadlines').select('*').order('due_date'));
}
export async function saveDeadline(row) {
  const q = row.id
    ? sb.from('deadlines').update(row).eq('id', row.id)
    : sb.from('deadlines').insert(row);
  return must(await q.select().single());
}
export async function upsertLegal(rows) {
  if (!rows.length) return [];
  return must(await sb.from('deadlines').upsert(rows, { onConflict: 'owner,rule_key' }).select());
}
export async function deleteLegal(ids) {
  if (ids.length) must(await sb.from('deadlines').delete().in('id', ids).eq('kind', 'legal'));
}
export async function deleteDeadline(id) {
  must(await sb.from('deadlines').delete().eq('id', id).eq('kind', 'custom'));
}

// Transactions
export async function listTransactions(from, to) {
  let q = sb.from('transactions').select('*').order('date', { ascending: false });
  if (from) q = q.gte('date', from);
  if (to) q = q.lte('date', to);
  return must(await q);
}
// Inserts new rows; rows whose dup_key already exists are skipped.
export async function addTransactions(rows) {
  if (!rows.length) return [];
  return must(await sb.from('transactions')
    .upsert(rows, { onConflict: 'owner,dup_key', ignoreDuplicates: true }).select());
}
export async function updateTransaction(id, patch) {
  return must(await sb.from('transactions').update(patch).eq('id', id).select().single());
}
export async function deleteTransaction(id) {
  must(await sb.from('transactions').delete().eq('id', id));
}

// Auto tagging rules
export async function listRules() {
  return must(await sb.from('category_rules').select('*').order('pattern'));
}
export async function saveRule(pattern, category) {
  return must(await sb.from('category_rules')
    .upsert({ pattern: pattern.trim().toLowerCase(), category }, { onConflict: 'owner,pattern' })
    .select().single());
}

export async function deleteRule(id) { must(await sb.from('category_rules').delete().eq('id', id)); }

// Tax pot
export async function listTaxPot() {
  return must(await sb.from('tax_pot').select('*').order('date'));
}
export async function addTaxPot(row) {
  return must(await sb.from('tax_pot').insert(row).select().single());
}

// Push
export async function savePushSubscription(sub) {
  const j = sub.toJSON ? sub.toJSON() : sub;
  return must(await sb.from('push_subscriptions').upsert({
    endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
    user_agent: navigator.userAgent.slice(0, 200),
  }, { onConflict: 'owner,endpoint' }).select().single());
}

export async function deletePushSubscription(endpoint) {
  must(await sb.from('push_subscriptions').delete().eq('endpoint', endpoint));
}

// Live sync: callback(table) on any change from any device.
const TABLES = ['company', 'deadlines', 'transactions', 'category_rules', 'tax_pot'];
export function onChange(cb) {
  const ch = sb.channel('tml-sync');
  for (const table of TABLES) {
    ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => cb(table));
  }
  ch.subscribe();
  return () => sb.removeChannel(ch);
}
