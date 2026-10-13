// Sparkle House AI helper: a Cloudflare Worker that keeps your Anthropic API key
// off the phone and forwards photos to Claude.
//
// Secrets / variables (set in the Cloudflare dashboard or with wrangler):
//   ANTHROPIC_API_KEY  (secret, required)  your Claude API key
//   APP_TOKEN          (secret, recommended) household passcode the app must send
//   ALLOWED_ORIGINS    (variable, optional) e.g. "https://yourname.github.io,capacitor://localhost"
//                      (capacitor://localhost is the iPhone app built from ios-app/)
//   MODEL_ANALYZE      (variable, optional) default claude-sonnet-5-5
//   MODEL_VERIFY       (variable, optional) default claude-haiku-5-5
//   ELEVENLABS_API_KEY (secret, optional)  turns on Fluff's AI voice
//   ELEVENLABS_MODEL   (variable, optional) default eleven_flash_v2_5
//
// Photos are passed straight through to the API and never stored here.

const ZONES = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];
const CATEGORIES = ['trash', 'put-away', 'laundry', 'dishes', 'surfaces', 'floors', 'other'];
const MAX_BODY = 9 * 1024 * 1024;

// Rough furniture positions, as seen from where the first photo was taken.
const SPOTS = ['back-left', 'back', 'back-right', 'left', 'center', 'right', 'front-left', 'front', 'front-right'];
const ANALYZE_SYSTEM = `You help a family turn photos of a messy room into a short, friendly cleaning checklist for a chore game.

You may get up to 4 photos of the same room taken from different spots. Treat them as one room and make one list.

Rules:
- Only list things you can actually see in the photos. Never invent objects.
- If the same item shows up in more than one photo, list it only once.
- Each task names the specific visible object and, when it's obvious, where it should go. Example: "Put the cereal box back in the pantry".
- Group small identical items into one task, such as "Pick up the 6 toy cars".
- Skip anything that already looks tidy. Do not mention or describe any people in the photo.
- Solid gray areas are outside the part of the room being cleaned. Ignore anything in them.
- Order tasks in a sensible cleaning flow: trash first, then things to put away, then surfaces, then floors.
- Points reflect effort: 2-5 for a quick grab, 6-12 for a few minutes of work, 13-25 for a big job.
- "photo" is the number of the photo where the item is easiest to see (1 if there's only one photo). "zone" is the ninth of THAT photo where the item sits: one of ${ZONES.join(', ')}.
- Also list the main furniture and big objects you can see (up to 12), such as sofa, bed, table, chairs, desk, TV, bookshelf, dresser, fridge, counter, sink, stove, toilet, bathtub, washer, rug, plant, lamp. Use one or two plain words for each. "spot" is roughly where it sits in the room, as if looking in from where the first photo was taken: ${SPOTS.join(', ')}.
- Return 3 to 12 tasks. If the room already looks tidy, return no tasks and say so in the summary. If the photo isn't of a room, return no tasks and say what you see in the summary.

Answer with the chore list in the required JSON format.`;

const VERIFY_SYSTEM = `You check progress in a family chore game. You get the open chores for a room, one or more recent AFTER photos, and usually one or more BEFORE photos taken when the list was made. Several photos are the same room from different spots.

Rules:
- The camera may have moved a little between photos. Compare the same areas, using each task's zone as a hint.
- A person may be in the AFTER photo. Ignore them and don't describe them.
- Solid gray areas are outside the part of the room being cleaned. Ignore anything in them.
- Mark a task done only when the AFTER photo clearly shows it is finished. If the area is hidden, blocked, or out of frame, do not mark it done.
- Be fair but encouraging. Never mark a task done just to be nice.

Answer in the required JSON format.`;

// JSON schemas guarantee Claude's answer comes back in a fixed structure.
// (Structured outputs require additionalProperties:false and don't support min/max.)
const CHORE_SCHEMA = {
  type: 'object',
  properties: {
    room_guess: { type: 'string', description: 'What kind of room this looks like.' },
    summary: { type: 'string', description: 'One upbeat sentence, max 20 words, about the room.' },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The chore, max 70 characters, naming the specific visible object.' },
          detail: { type: 'string', description: 'Short optional tip, or an empty string.' },
          photo: { type: 'integer', description: 'Which photo (1-4) shows this item best.' },
          zone: { type: 'string', enum: ZONES },
          points: { type: 'integer', description: 'Effort points from 1 to 25.' },
          minutes: { type: 'integer', description: 'Estimated minutes from 1 to 90.' },
          category: { type: 'string', enum: CATEGORIES }
        },
        required: ['title', 'detail', 'photo', 'zone', 'points', 'minutes', 'category'],
        additionalProperties: false
      }
    },
    furniture: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          item: { type: 'string', description: 'One or two plain words, like "sofa" or "coffee table".' },
          spot: { type: 'string', enum: SPOTS }
        },
        required: ['item', 'spot'],
        additionalProperties: false
      }
    }
  },
  required: ['room_guess', 'summary', 'tasks', 'furniture'],
  additionalProperties: false
};
const PROGRESS_SCHEMA = {
  type: 'object',
  properties: {
    done: { type: 'array', items: { type: 'string' }, description: 'IDs of chores that are clearly finished.' },
    blocked: { type: 'array', items: { type: 'string' }, description: 'IDs of chores whose area is hidden or out of frame.' },
    feedback: { type: 'string', description: 'One upbeat line, max 14 words. Name what was finished, or nudge toward an easy remaining chore.' }
  },
  required: ['done', 'blocked', 'feedback'],
  additionalProperties: false
};

// Fluff's personality changes the tone of everything the AI says out loud (never the facts).
const PERSONA_STYLE = {
  sunny: 'a bubbly, warm cheerleader who celebrates every bit of progress',
  sarge: 'a friendly drill sergeant: short, punchy, firm but never mean or insulting, calls them "recruit"',
  snooze: 'a sleepy, deadpan dust bunny with gentle, dry sarcasm who is secretly proud of them; never mean',
  captain: 'a jolly pirate captain who talks about treasure and swabbing the deck, says "arr" and "matey"'
};
function withPersona(system, persona) {
  const style = PERSONA_STYLE[persona];
  return style ? `${system}\n\nVoice: write the summary, feedback or answer in the voice of Fluff, ${style}. Keep it kid-friendly and keep the same length limits. Chore titles stay plain and clear.` : system;
}

const ASK_SYSTEM = `You are Fluff, a friendly helper in a family chore game. Someone is cleaning a room and has a question, usually that they can't find the item a chore mentions.

Rules:
- Answer in one or two short sentences (max 35 words). Your answer is read aloud, so keep it natural and warm.
- To help them find something, describe where it is using big, easy landmarks: left or right side, near the couch, on the bottom shelf, next to the lamp. Mention its color or shape if that helps.
- If you can't see the item in the photo, say so honestly. It may already be put away, or the chore may be a mistake they can delete.
- If no photo is provided, answer from the chore list alone and say you'd need a photo to point to it.
- Solid gray areas are outside the part of the room being cleaned. Ignore anything in them.
- Never describe the people in the photo.
- "zone" is the ninth of the photo where the item is, or "none" if you can't see it or there's no photo.`;
// Coach Mode setup: which chores can the propped-up phone actually see from where it is?
const FRAME_SYSTEM = `You help set up a phone camera that watches a family clean a room. You get the camera's current view, usually a reference photo of the same area taken when the chore list was made, and the chores for that area.

Decide which chores' areas are clearly in view in the CURRENT view (in frame, not hidden behind furniture, not too dark or blurry to judge). Use the reference photo and each chore's zone to know where each chore is.

If some chores are out of view, give one short tip for moving the phone so it sees more, in plain words a child could follow (for example "Move me a little higher" or "Turn me a bit to the left"). If everything is in view, the tip is an empty string.

Answer in the required JSON format.`;
const FRAME_SCHEMA = {
  type: 'object',
  properties: {
    visible: { type: 'array', items: { type: 'string' }, description: 'IDs of chores whose area is clearly in view.' },
    tip: { type: 'string', description: 'One short tip, max 12 words, for moving the phone to see more. Empty if everything is visible.' }
  },
  required: ['visible', 'tip'],
  additionalProperties: false
};

const ASK_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string', description: 'One or two short spoken sentences, max 35 words.' },
    zone: { type: 'string', enum: [...ZONES, 'none'] },
    found: { type: 'boolean', description: 'Whether the item they asked about is visible in the photo.' }
  },
  required: ['answer', 'zone', 'found'],
  additionalProperties: false
};

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    const reply = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (env.APP_TOKEN && request.headers.get('X-App-Token') !== env.APP_TOKEN) {
      return reply({ error: 'Wrong household passcode. Check it in Settings.' }, 401);
    }
    if (!env.ANTHROPIC_API_KEY) return reply({ error: 'The helper is missing its ANTHROPIC_API_KEY secret.' }, 500);

    if (url.pathname === '/health') return reply({ ok: true, voice: !!env.ELEVENLABS_API_KEY });
    if (url.pathname === '/voices') {
      try { return reply(await listVoices(env)); }
      catch (err) { return reply({ error: err.message }, err.status || 502); }
    }
    if (url.pathname === '/push/key') {
      try { return reply({ key: (await vapidKeys(env)).publicKey }); }
      catch (err) { return reply({ error: err.message }, err.status || 502); }
    }
    if (request.method !== 'POST') return reply({ error: 'Not found' }, 404);

    const len = Number(request.headers.get('Content-Length') || 0);
    if (len > MAX_BODY) return reply({ error: 'That photo is too large.' }, 413);

    let body;
    try { body = await request.json(); } catch { return reply({ error: 'Bad request.' }, 400); }

    if (url.pathname === '/speak') {
      try {
        const audio = await speak(body, env);
        return new Response(audio, { headers: { ...cors, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
      } catch (err) { return reply({ error: err.message }, err.status || 502); }
    }

    try {
      if (url.pathname === '/analyze') return reply(await analyze(body, env));
      if (url.pathname === '/verify') return reply(await verify(body, env));
      if (url.pathname === '/frame') return reply(await frame(body, env));
      if (url.pathname === '/ask') return reply(await ask(body, env));
      if (url.pathname.startsWith('/push/')) return reply(await pushRoute(url.pathname, body, env));
      if (url.pathname === '/sync') return reply(await syncRoute(body, env));
      return reply({ error: 'Not found' }, 404);
    } catch (err) {
      return reply({ error: err.message || 'The AI helper hit a problem.' }, err.status || 502);
    }
  },

  // Cron Trigger (every 15 minutes): send any reminders that are due.
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runReminders(env, controller.scheduledTime || Date.now()));
  }
};

/* ---------- Household sync (D1) ----------
   Needs a D1 database connected to the helper as SPARKLE_DB. Everyone using this helper shares one household.
   Each shared thing (player, room, chore list, chore, sparkle event) is one row. Every write gets a new,
   unique sequence number, so phones fetch only what changed since their last sync. */
const SYNC_KINDS = ['player', 'room', 'session', 'task', 'event'];
const SYNC_PAGE = 800;
let syncReady = false;
async function syncSetup(db) {
  if (syncReady) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS items (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT, deleted INTEGER NOT NULL DEFAULT 0, seq INTEGER NOT NULL, PRIMARY KEY (kind, id))'),
    db.prepare('CREATE INDEX IF NOT EXISTS items_seq ON items (seq)'),
    db.prepare('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL)'),
    db.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('seq', 0)")
  ]);
  syncReady = true;
}
function cleanOps(ops) {
  if (!Array.isArray(ops)) return [];
  if (ops.length > 600) throw badRequest('Too many changes in one sync. Try again.');
  return ops.map((o) => {
    const k = String(o.k || ''), i = String(o.i || '');
    if (!SYNC_KINDS.includes(k) || !/^[A-Za-z0-9_:-]{1,60}$/.test(i)) throw badRequest('A sync change wasn\'t valid.');
    if (o.x) return { k, i, d: null, x: 1 };
    if (!o.d || typeof o.d !== 'object') throw badRequest('A sync change wasn\'t valid.');
    return { k, i, d: o.d, x: 0 };
  });
}
async function syncRoute(body, env) {
  const db = env.SPARKLE_DB;
  if (!db) throw httpError('Household sync needs a D1 database connected to the helper as SPARKLE_DB.', 501);
  await syncSetup(db);
  const since = Math.max(0, Math.floor(Number(body.since) || 0));
  const ops = cleanOps(body.ops);
  const stmts = [];
  if (ops.length) {
    // Reserve one sequence number per change, then write every change in the same transaction.
    stmts.push(db.prepare("UPDATE meta SET v = v + ?1 WHERE k = 'seq'").bind(ops.length));
    stmts.push(db.prepare(
      `INSERT INTO items (kind, id, data, deleted, seq)
       SELECT json_extract(value, '$.k'), json_extract(value, '$.i'), json_extract(value, '$.d'), json_extract(value, '$.x'),
              (SELECT v FROM meta WHERE k = 'seq') - ?2 + 1 + key
       FROM json_each(?1) WHERE true
       ON CONFLICT (kind, id) DO UPDATE SET data = excluded.data, deleted = excluded.deleted, seq = excluded.seq`
    ).bind(JSON.stringify(ops), ops.length));
  }
  stmts.push(db.prepare('SELECT kind, id, data, deleted, seq FROM items WHERE seq > ?1 ORDER BY seq LIMIT ?2').bind(since, SYNC_PAGE));
  stmts.push(db.prepare("SELECT v FROM meta WHERE k = 'seq'"));
  const res = await db.batch(stmts);
  const rows = res[res.length - 2].results || [];
  const head = (res[res.length - 1].results[0] || {}).v || 0;
  const items = rows.map((r) => ({ k: r.kind, i: r.id, x: r.deleted ? 1 : 0, s: r.seq, d: r.deleted || r.data == null ? null : JSON.parse(r.data) }));
  const last = items.length ? items[items.length - 1].s : since;
  return { items, seq: items.length === SYNC_PAGE ? last : Math.max(last, head), more: items.length === SYNC_PAGE, wrote: ops.length };
}

/* ---------- Reminders (Web Push) ----------
   Needs a KV namespace bound as SPARKLE_KV and a Cron Trigger such as "*\/15 * * * *".
   The helper makes its own push (VAPID) keys and keeps them in KV. */
const PUSH_DEFAULTS = { daily: '17:30', streak: true, weekly: true, flash: true, quietStart: '21:00', quietEnd: '08:00' };
const PUSH_HOSTS = /(^|\.)push\.apple\.com$|^fcm\.googleapis\.com$|(^|\.)push\.services\.mozilla\.com$|(^|\.)notify\.windows\.com$/;
const te = new TextEncoder();
const b64u = {
  enc(buf) { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec(str) { let s = String(str).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
};
const concatBytes = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

function needKV(env) {
  if (!env.SPARKLE_KV) throw httpError('Reminders need a KV namespace connected to the helper as SPARKLE_KV.', 501);
  return env.SPARKLE_KV;
}
async function vapidKeys(env) {
  const kv = needKV(env);
  let v = await kv.get('vapid', 'json');
  if (!v) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    v = { publicKey: b64u.enc(await crypto.subtle.exportKey('raw', pair.publicKey)), jwk: await crypto.subtle.exportKey('jwk', pair.privateKey) };
    await kv.put('vapid', JSON.stringify(v));
  }
  return v;
}
function pushContact(env) {
  if (env.PUSH_CONTACT) return env.PUSH_CONTACT;
  const first = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).find((s) => /^https:\/\//.test(s));
  return first || 'https://github.com';
}
// Apple asks servers not to make a new token more than once an hour, so tokens are reused for ~11 hours.
async function vapidAuth(env, endpoint) {
  const kv = needKV(env);
  const v = await vapidKeys(env);
  const aud = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const cached = await kv.get('jwt:' + aud, 'json');
  if (cached && cached.pk === v.publicKey && cached.exp - now > 3600) return `vapid t=${cached.token}, k=${v.publicKey}`;
  const exp = now + 12 * 3600;
  const head = b64u.enc(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u.enc(te.encode(JSON.stringify({ aud, exp, sub: pushContact(env) })));
  const key = await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(`${head}.${claims}`));
  const token = `${head}.${claims}.${b64u.enc(sig)}`;
  await kv.put('jwt:' + aud, JSON.stringify({ token, exp, pk: v.publicKey }));
  return `vapid t=${token}, k=${v.publicKey}`;
}
// RFC 8291 message encryption (aes128gcm), so only the phone can read the notification text.
async function encryptPush(sub, text) {
  const uaPublic = b64u.dec(sub.keys.p256dh), authSecret = b64u.dec(sub.keys.auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const hkdf = async (salt, ikm, info, bytes) => new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), bytes * 8));
  const ikm = await hkdf(authSecret, shared, concatBytes(te.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concatBytes(te.encode(text), new Uint8Array([2]))));
  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concatBytes(header, cipher);
}
async function sendPush(env, rec, message, { ttl = 3600, urgency = 'normal', topic = '' } = {}) {
  const headers = {
    Authorization: await vapidAuth(env, rec.sub.endpoint),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(ttl),
    Urgency: urgency
  };
  if (topic) headers.Topic = topic;
  const res = await fetch(rec.sub.endpoint, { method: 'POST', headers, body: await encryptPush(rec.sub, JSON.stringify(message)) });
  if (!res.ok) console.log('Push not delivered', res.status, (await res.text().catch(() => '')).slice(0, 200));
  return res.status;
}

/* --- requests from the app --- */
function cleanId(id) { const s = String(id || ''); if (!/^[A-Za-z0-9]{6,32}$/.test(s)) throw badRequest('Missing device id.'); return s; }
function cleanTz(tz) { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return String(tz); } catch { return 'UTC'; } }
function cleanTime(t, fallback) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : fallback; }
function cleanPrefs(p = {}) {
  return {
    daily: p.daily === null || p.daily === false ? null : cleanTime(p.daily, PUSH_DEFAULTS.daily),
    streak: p.streak !== false, weekly: p.weekly !== false, flash: p.flash !== false,
    quietStart: cleanTime(p.quietStart, PUSH_DEFAULTS.quietStart), quietEnd: cleanTime(p.quietEnd, PUSH_DEFAULTS.quietEnd),
    persona: PERSONA_STYLE[p.persona] ? p.persona : 'sunny'
  };
}
function cleanState(s = {}) {
  const str = (v, n) => String(v || '').slice(0, n);
  const int = (v) => Math.max(0, Math.min(100000, Math.round(Number(v) || 0)));
  const w = s.week || {};
  return {
    name: str(s.name, 20), lastDone: /^\d{4}-\d{2}-\d{2}$/.test(s.lastDone) ? s.lastDone : '', streak: int(s.streak),
    open: int(s.open), openRoom: str(s.openRoom, 30), openRoomId: str(s.openRoomId, 20).replace(/[^A-Za-z0-9_-]/g, ''),
    needy: str(s.needy, 30), needyId: str(s.needyId, 20).replace(/[^A-Za-z0-9_-]/g, ''),
    week: { chores: int(w.chores), sparkles: int(w.sparkles), leader: str(w.leader, 20) }
  };
}
async function pushRoute(path, body, env) {
  const kv = needKV(env);
  const id = cleanId(body.id);
  const key = 'sub:' + id;
  if (path === '/push/subscribe') {
    const s = body.subscription || {};
    let host = '';
    try { host = new URL(s.endpoint).hostname; } catch { /* invalid */ }
    if (!/^https:/.test(String(s.endpoint)) || !PUSH_HOSTS.test(host) || !s.keys || !s.keys.p256dh || !s.keys.auth) throw badRequest('That notification subscription isn\'t valid.');
    const old = await kv.get(key, 'json');
    const rec = { sub: { endpoint: s.endpoint, keys: { p256dh: String(s.keys.p256dh), auth: String(s.keys.auth) } }, tz: cleanTz(body.tz), prefs: cleanPrefs(body.prefs), state: cleanState(body.state), sent: (old && old.sent) || {}, created: (old && old.created) || Date.now() };
    await kv.put(key, JSON.stringify(rec));
    return { ok: true };
  }
  const rec = await kv.get(key, 'json');
  if (path === '/push/unsubscribe') { if (rec) await kv.delete(key); return { ok: true }; }
  if (!rec) throw httpError('Reminders aren\'t set up on this phone yet.', 404);
  if (path === '/push/update') {
    if (body.tz) rec.tz = cleanTz(body.tz);
    if (body.prefs) rec.prefs = cleanPrefs(body.prefs);
    if (body.state) rec.state = cleanState(body.state);
    await kv.put(key, JSON.stringify(rec));
    return { ok: true };
  }
  if (path === '/push/test') {
    const status = await sendPush(env, rec, { title: 'Sparkle House', body: 'Reminders are working! Fluff will cheer you on.', url: './', tag: 'test' }, { ttl: 120, urgency: 'high' });
    if (status === 404 || status === 410) { await kv.delete(key); throw httpError('This phone\'s notification permission has expired. Turn reminders off and on again.', 410); }
    if (status < 200 || status >= 300) throw httpError(`The notification service refused the test (error ${status}).`, 502);
    return { ok: true };
  }
  throw httpError('Not found', 404);
}

/* --- the schedule --- */
function localParts(tz, ms) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23'
  }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, mins: (Number(parts.hour) % 24) * 60 + Number(parts.minute), weekday: parts.weekday };
}
const toMins = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const isDue = (target, mins) => mins >= target && mins < target + 60;
function inQuiet(mins, start, end) {
  if (start === end) return false;
  return start < end ? mins >= start && mins < end : mins >= start || mins < end;
}
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
const plur = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
// Reminder wording for each Fluff personality. {n} streak days, {open} chores, {room}, {name}, {line} = streak line.
const PUSH_COPY = {
  sunny: {
    streakT: ['Your {n}-day streak ends at midnight!', "Don't break the chain{name}!"],
    streakB: ['One quick chore keeps your {n} days going. Fluff believes in you!', 'Just one chore before bed saves your {n}-day streak.'],
    listT: ['Your list is waiting', 'Ready for a quick win{name}?', 'Fluff saved your spot'],
    listB: '{open} left in the {room}. Knock one out for a quick sparkle boost!{line}',
    needyT: 'The {room} misses you', needyB: "A quick tidy would make it sparkle again. Fluff's ready when you are!{line}",
    anyT: ['Time for a quick sparkle?', "Fluff's bored{name}!", 'Ten minutes, big sparkles'], anyB: 'Snap a messy room and Fluff will turn it into a game.{line}',
    line: ' Keep your {n}-day streak going!', weekT: 'Your sparkle week', freshT: 'New week, fresh start',
    flashT: 'Flash bonus! Double sparkles', flashB: 'Every chore you finish in the next 30 minutes earns double sparkles. Go go go!'
  },
  sarge: {
    streakT: ['Recruit! Your {n}-day streak ends at midnight!', 'Streak in danger{name}!'],
    streakB: ['One chore, recruit. That is all it takes to save {n} days. Move!', 'Do not let {n} days of hard work go to waste. One chore. Now!'],
    listT: ['Mission still open, recruit', 'Report for duty{name}!', 'Back to the front lines'],
    listB: '{open} left in the {room}. Get in there and finish the job, recruit!{line}',
    needyT: 'The {room} needs backup', needyB: 'That room is a disaster zone, recruit. Deploy for ten minutes.{line}',
    anyT: ['Drill time, recruit!', 'On your feet{name}!', 'Ten minutes. Go.'], anyB: 'Snap a room and I will give you your orders.{line}',
    line: ' Protect that {n}-day streak!', weekT: 'Weekly debrief, recruit', freshT: 'New week, new mission',
    flashT: 'Speed drill! Double sparkles', flashB: 'Every chore in the next 30 minutes counts double, recruit. Move, move, move!'
  },
  snooze: {
    streakT: ['Your {n}-day streak ends at midnight. Just saying.', 'Psst{name}. The streak.'],
    streakB: ['One chore saves {n} days of effort. I\'d do it for you, but I\'m napping.', 'Your {n}-day streak is about to nap forever. One chore wakes it up.'],
    listT: ['Your list is still there', 'Hey{name}. The list.', 'I kept your spot warm'],
    listB: '{open} left in the {room}. I checked. From bed.{line}',
    needyT: 'The {room} looks how I feel', needyB: 'A quick tidy would fix it. I believe in you. Mostly.{line}',
    anyT: ['Clean something? Maybe?', 'You up{name}?', 'Ten minutes. Then nap.'], anyB: 'Snap a messy room. I\'ll turn it into a game. Then sleep.{line}',
    line: ' Also, your {n}-day streak. No pressure.', weekT: 'Your week, summarized sleepily', freshT: 'New week. Ugh. Fine.',
    flashT: 'Double sparkles. Wow.', flashB: 'Chores in the next 30 minutes count double. Even I\'m tempted. Not really.'
  },
  captain: {
    streakT: ['Arr! Yer {n}-day streak sinks at midnight!', "Don't let her sink{name}!"],
    streakB: ['One chore keeps yer {n}-day streak afloat, matey!', 'Swab one deck before bed and save {n} days of treasure!'],
    listT: ['Treasure still be waitin\'', 'Ahoy{name}!', 'Back to the ship, matey'],
    listB: '{open} left in the {room}. Plunder one for a fine sparkle bounty!{line}',
    needyT: 'The {room} be a shipwreck', needyB: 'A quick swabbin\' would make her shine again, matey!{line}',
    anyT: ['All hands on deck!', 'Ahoy{name}! Fancy a treasure hunt?', 'Hoist the mop!'], anyB: 'Snap a messy room and Fluff will map the treasure.{line}',
    line: ' Keep yer {n}-day streak afloat!', weekT: "Captain's weekly log", freshT: 'A fresh voyage begins',
    flashT: 'Double treasure, matey!', flashB: 'Every chore in the next 30 minutes earns double sparkles. Hoist the sails!'
  }
};
function fillCopy(t, v) { return String(t).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? ''); }
function pickReminder(rec, ms) {
  const p = { ...PUSH_DEFAULTS, ...rec.prefs }, st = rec.state || {}, sent = rec.sent || {};
  if (ms - (sent.last || 0) < 45 * 60000) return null; // never two pushes close together
  const L = localParts(rec.tz, ms);
  const yesterday = localParts(rec.tz, ms - 864e5).date;
  if (inQuiet(L.mins, toMins(p.quietStart), toMins(p.quietEnd))) return null;
  const doneToday = st.lastDone === L.date;
  const copy = PUSH_COPY[p.persona] || PUSH_COPY.sunny;
  const v = { name: st.name ? `, ${st.name}` : '', n: st.streak, open: plur(st.open || 0, 'chore'), room: String(st.openRoom || st.needy || '').toLowerCase() };
  const badge = st.open || 0;

  if (p.streak && !doneToday && st.lastDone === yesterday && st.streak >= 2 && sent.streak !== L.date && isDue(19 * 60 + 30, L.mins)) {
    return { kind: 'streak', mark: L.date, opts: { ttl: 3 * 3600, urgency: 'high', topic: 'streak' }, payload: {
      title: fillCopy(pickOne(copy.streakT), v), body: fillCopy(pickOne(copy.streakB), v),
      url: st.openRoomId ? `./?room=${st.openRoomId}` : './', tag: 'streak', badge } };
  }
  if (p.weekly && L.weekday === 'Sun' && sent.weekly !== L.date && isDue(18 * 60, L.mins)) {
    const w = st.week || {};
    return { kind: 'weekly', mark: L.date, opts: { ttl: 6 * 3600, urgency: 'normal', topic: 'weekly' }, payload: w.chores ? {
      title: copy.weekT,
      body: `This week: ${plur(w.chores, 'chore')} and ${plur(w.sparkles, 'sparkle')}.${w.leader ? ` ${w.leader} led the house!` : ''} Ready for a fresh week?`,
      url: './', tag: 'weekly', badge } : {
      title: copy.freshT,
      body: 'Snap one room tonight and Fluff will turn it into a game. A quick win starts a new streak!',
      url: './', tag: 'weekly', badge } };
  }
  if (p.daily && !doneToday && sent.daily !== L.date && isDue(toMins(p.daily), L.mins)) {
    v.line = st.streak >= 2 && st.lastDone === yesterday ? fillCopy(copy.line, v) : '';
    let payload;
    if (st.open && st.openRoom) payload = { title: fillCopy(pickOne(copy.listT), v), body: fillCopy(copy.listB, { ...v, room: st.openRoom.toLowerCase() }), url: `./?room=${st.openRoomId}` };
    else if (st.needy) payload = { title: fillCopy(copy.needyT, { ...v, room: st.needy.toLowerCase() }), body: fillCopy(copy.needyB, v), url: st.needyId ? `./?room=${st.needyId}` : './' };
    else payload = { title: fillCopy(pickOne(copy.anyT), v), body: fillCopy(copy.anyB, v), url: './' };
    return { kind: 'daily', mark: L.date, opts: { ttl: 2 * 3600, urgency: 'normal', topic: 'daily' }, payload: { ...payload, tag: 'daily', badge } };
  }
  // Flash bonus: about twice a week, at a random time between 4 and 7 PM.
  if (p.flash && L.mins >= 16 * 60 && L.mins < 19 * 60 && ms - (sent.flash || 0) > 2 * 864e5 && Math.random() < 0.03) {
    const until = ms + 30 * 60000;
    return { kind: 'flash', mark: ms, opts: { ttl: 15 * 60, urgency: 'high', topic: 'flash' }, payload: {
      title: copy.flashT, body: copy.flashB, url: `./?flash=${until}`, tag: 'flash', badge } };
  }
  return null;
}
async function runReminders(env, ms) {
  const kv = env.SPARKLE_KV;
  if (!kv) return;
  const { keys } = await kv.list({ prefix: 'sub:' });
  for (const k of keys) {
    const rec = await kv.get(k.name, 'json');
    if (!rec || !rec.sub) continue;
    let r;
    try { r = pickReminder(rec, ms); } catch (e) { console.log('Reminder check failed', e.message); continue; }
    if (!r) continue;
    try {
      const status = await sendPush(env, rec, r.payload, r.opts);
      if (status === 404 || status === 410) { await kv.delete(k.name); continue; }
      if (status >= 200 && status < 300) {
        rec.sent = { ...rec.sent, [r.kind]: r.mark, last: ms };
        await kv.put(k.name, JSON.stringify(rec));
      }
    } catch (e) { console.log('Reminder send failed', e.message); }
  }
}

const photoList = (many, one) => (Array.isArray(many) ? many : [one]).filter(isB64).slice(0, 4);
async function analyze(body, env) {
  const photos = photoList(body.images, body.image);
  if (!photos.length) throw badRequest('No photo received.');
  const room = String(body.room || 'room').slice(0, 40);
  const content = [];
  photos.forEach((p, i) => { if (photos.length > 1) content.push({ type: 'text', text: `Photo ${i + 1}:` }); content.push(imageBlock(p)); });
  content.push({ type: 'text', text: photos.length > 1 ? `These ${photos.length} photos show the ${room} from different spots. Make one chore list for the whole room.` : `This is the ${room}. Make the chore list.` });
  const j = await askClaude(env, env.MODEL_ANALYZE || 'claude-sonnet-5-5', withPersona(ANALYZE_SYSTEM, body.persona), content, CHORE_SCHEMA, 5000);
  const tasks = (Array.isArray(j.tasks) ? j.tasks : []).slice(0, 15).map((t) => ({
    title: String(t.title || '').trim().slice(0, 90),
    detail: String(t.detail || '').trim().slice(0, 120),
    photo: clampNum(t.photo, 1, photos.length, 1),
    zone: pickEnum(t.zone, ZONES, 'center'),
    points: clampNum(t.points, 1, 25, 4),
    minutes: clampNum(t.minutes, 1, 90, 2),
    category: pickEnum(t.category, CATEGORIES, 'other')
  })).filter((t) => t.title);
  const furniture = (Array.isArray(j.furniture) ? j.furniture : []).slice(0, 12)
    .map((f) => ({ item: String(f.item || '').trim().toLowerCase().slice(0, 30), spot: pickEnum(f.spot, SPOTS, 'center') }))
    .filter((f) => f.item);
  return { room_guess: String(j.room_guess || '').slice(0, 40), summary: String(j.summary || '').slice(0, 200), tasks, furniture };
}

async function verify(body, env) {
  const afters = photoList(body.afters, body.after);
  const befores = photoList(body.befores, body.before);
  if (!afters.length) throw badRequest('No photo received.');
  const tasks = (Array.isArray(body.tasks) ? body.tasks : []).slice(0, 30).map((t) => ({
    id: String(t.id).slice(0, 20), title: String(t.title || '').slice(0, 90), zone: t.zone || 'unknown', ...(t.photo ? { photo: clampNum(t.photo, 1, 4, 1) } : {})
  }));
  if (!tasks.length) return { done: [], blocked: [], feedback: 'Everything is already done!' };
  const content = [];
  befores.forEach((p, i) => content.push({ type: 'text', text: befores.length > 1 ? `BEFORE photo ${i + 1}:` : 'BEFORE photo:' }, imageBlock(p)));
  afters.forEach((p, i) => content.push({ type: 'text', text: afters.length > 1 ? `AFTER photo ${i + 1}:` : 'AFTER photo:' }, imageBlock(p)));
  content.push({ type: 'text', text: `Open chores:\n${JSON.stringify(tasks)}` });
  const j = await askClaude(env, env.MODEL_VERIFY || 'claude-haiku-5-5', withPersona(VERIFY_SYSTEM, body.persona), content, PROGRESS_SCHEMA, 1500);
  const ids = new Set(tasks.map((t) => t.id));
  return {
    done: (Array.isArray(j.done) ? j.done : []).map(String).filter((id) => ids.has(id)),
    blocked: (Array.isArray(j.blocked) ? j.blocked : []).map(String).filter((id) => ids.has(id)),
    feedback: String(j.feedback || '').slice(0, 140)
  };
}

async function frame(body, env) {
  if (!isB64(body.view)) throw badRequest('No photo received.');
  const tasks = (Array.isArray(body.tasks) ? body.tasks : []).slice(0, 30).map((t) => ({ id: String(t.id).slice(0, 20), title: String(t.title || '').slice(0, 90), zone: t.zone || 'unknown' }));
  if (!tasks.length) return { visible: [], tip: '' };
  const content = [];
  if (isB64(body.reference)) content.push({ type: 'text', text: 'Reference photo (when the list was made):' }, imageBlock(body.reference));
  content.push({ type: 'text', text: 'CURRENT camera view:' }, imageBlock(body.view));
  content.push({ type: 'text', text: `Chores for this area:\n${JSON.stringify(tasks)}` });
  const j = await askClaude(env, env.MODEL_VERIFY || 'claude-haiku-5-5', FRAME_SYSTEM, content, FRAME_SCHEMA, 600);
  const ids = new Set(tasks.map((t) => t.id));
  return { visible: (Array.isArray(j.visible) ? j.visible : []).map(String).filter((id) => ids.has(id)), tip: String(j.tip || '').slice(0, 90) };
}

async function ask(body, env) {
  const question = String(body.question || '').trim().slice(0, 400);
  if (!question) throw badRequest('Ask Fluff a question first.');
  const content = [];
  if (isB64(body.image)) content.push({ type: 'text', text: 'Photo of the room right now:' }, imageBlock(body.image));
  const task = body.task && body.task.title ? `The chore they're asking about: "${String(body.task.title).slice(0, 120)}"${body.task.zone ? ` (listed in the ${body.task.zone} part of the photo)` : ''}.\n` : '';
  const others = Array.isArray(body.tasks) ? body.tasks.slice(0, 20).map((t) => `- ${String(t).slice(0, 100)}`).join('\n') : '';
  content.push({ type: 'text', text: `${task}${others ? `Other open chores:\n${others}\n` : ''}Their question: ${question}` });
  const j = await askClaude(env, env.MODEL_ASK || 'claude-sonnet-5-5', withPersona(ASK_SYSTEM, body.persona), content, ASK_SCHEMA, 800);
  return { answer: String(j.answer || '').slice(0, 300), zone: pickEnum(j.zone, [...ZONES, 'none'], 'none'), found: !!j.found };
}

/* ---------- Fluff's voice (ElevenLabs) ---------- */
async function speak(body, env) {
  if (!env.ELEVENLABS_API_KEY) throw httpError('Fluff\'s AI voice isn\'t set up on the helper.', 501);
  const text = String(body.text || '').replace(/[\u2726\u2728]/g, '').trim().slice(0, 300);
  const voice = String(body.voice || '').replace(/[^A-Za-z0-9]/g, '');
  if (!text) throw badRequest('Nothing to say.');
  if (!voice) throw badRequest('No voice chosen.');
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: env.ELEVENLABS_MODEL || 'eleven_flash_v2_5' })
  });
  if (!res.ok) throw httpError(await elevenError(res), res.status === 401 || res.status === 402 || res.status === 429 ? res.status : 502);
  return res.body;
}
async function listVoices(env) {
  if (!env.ELEVENLABS_API_KEY) return { voices: [] };
  const res = await fetch('https://api.elevenlabs.io/v2/voices?page_size=100&include_total_count=false', {
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY }
  });
  if (!res.ok) throw httpError(await elevenError(res), 502);
  const data = await res.json();
  return {
    voices: (data.voices || []).map((v) => ({
      id: v.voice_id,
      name: v.name,
      category: v.category,
      description: [v.labels && v.labels.gender, v.labels && v.labels.age, v.labels && v.labels.accent, v.labels && (v.labels.descriptive || v.labels.description)].filter(Boolean).join(', '),
      preview: v.preview_url || ''
    }))
  };
}
async function elevenError(res) {
  const data = await res.json().catch(() => ({}));
  const d = data && data.detail;
  const msg = typeof d === 'string' ? d : (d && (d.message || d.status)) || `status ${res.status}`;
  if (/quota|credit/i.test(msg)) return 'Fluff is out of ElevenLabs voice credits for now.';
  if (res.status === 401) return 'ElevenLabs rejected the API key. Check ELEVENLABS_API_KEY.';
  return `ElevenLabs error: ${msg}`;
}
function httpError(msg, status) { const e = new Error(msg); e.status = status; return e; }

async function askClaude(env, model, system, content, schema, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens, system,
      output_config: { format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content }]
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data && data.error && data.error.message ? data.error.message : `status ${res.status}`;
    throw new Error(`Claude API error: ${msg}`);
  }
  if (data.stop_reason === 'refusal') throw new Error('The AI declined to look at that photo. Try a different shot of the room.');
  if (data.stop_reason === 'max_tokens') throw new Error('The AI answer was cut off. Try again.');
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try { return parseJSON(text); } catch (e) {
    console.log('Unparseable answer', { stop_reason: data.stop_reason, text: text.slice(0, 500) });
    throw e;
  }
}

function pickEnum(v, list, dflt) { const x = String(v || '').toLowerCase().trim(); return list.find((o) => o === x) || dflt; }
function badRequest(msg) { const e = new Error(msg); e.status = 400; return e; }
function imageBlock(b64) {
  return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } };
}
function isB64(s) { return typeof s === 'string' && s.length > 100 && /^[A-Za-z0-9+/=]+$/.test(s.slice(0, 200)); }
function clampNum(v, lo, hi, dflt) { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt; }
function parseJSON(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a === -1 || b <= a) throw new Error('The AI answer wasn\'t in the expected format. Try again.');
  try { return JSON.parse(text.slice(a, b + 1)); }
  catch { throw new Error('The AI answer wasn\'t in the expected format. Try again.'); }
}
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
  const allow = allowed.includes('*') ? '*' : (allowed.includes(origin) ? origin : allowed[0]);
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-App-Token',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}
