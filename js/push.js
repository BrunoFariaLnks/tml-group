// Turning push notifications on and off for this device.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const FN = `${SUPABASE_URL}/functions/v1/notify`;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function b64ToBytes(b64) {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

let current = null;
async function refresh() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    current = reg ? await reg.pushManager.getSubscription() : null;
  } catch { current = null; }
}
refresh();

// What the More screen shows.
export function pushState() {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIOS && !standalone) {
    return { supported: false, subscribed: false, message: 'On iPhone, notifications only work from the installed app.',
      help: ['Open this page in Safari.', 'Tap the Share button.', 'Tap Add to Home Screen, then Add.', 'Open TML Group from the home screen and sign in.', 'Come back here and turn notifications on.'] };
  }
  if (!supported) return { supported: false, subscribed: false, message: 'This browser cannot show notifications. Use Chrome or Edge on the laptop, or the installed app on iPhone.' };
  if (Notification.permission === 'denied') {
    return { supported: false, subscribed: false, message: 'Notifications are blocked for this app.',
      help: isIOS ? ['Open iPhone Settings.', 'Tap Notifications, then TML Group.', 'Turn on Allow Notifications.', 'Come back and turn them on here.']
        : ['Click the icon to the left of the address bar (or the app menu in the installed app).', 'Open Site settings or Permissions.', 'Set Notifications to Allow.', 'Reload the app and turn them on here.'] };
  }
  if (current) return { supported: true, subscribed: true, message: 'Notifications are on for this device.' };
  return { supported: true, subscribed: false, message: 'Notifications are off for this device.' };
}

export async function enablePush(store) {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications were not allowed. See the steps below to allow them.');
  const reg = await navigator.serviceWorker.ready;
  const res = await fetch(`${FN}?action=key`, { headers: { apikey: SUPABASE_ANON_KEY } });
  const { publicKey } = await res.json();
  if (!publicKey) throw new Error('Could not reach the notification server. Try again.');
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  await store.savePushSubscription(sub);
  current = sub;
}

export async function disablePush(store, quiet = false) {
  await refresh();
  if (!current) { if (!quiet) throw new Error('Notifications are already off.'); return; }
  const endpoint = current.endpoint;
  await current.unsubscribe();
  current = null;
  await store.deletePushSubscription(endpoint);
}

export async function sendTest(store) {
  const s = await store.session();
  const res = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${s?.access_token}` },
    body: JSON.stringify({ action: 'test' }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || 'Test failed. Try again.');
  if (!out.sent) throw new Error('No device received it. Turn notifications off and on again.');
}
