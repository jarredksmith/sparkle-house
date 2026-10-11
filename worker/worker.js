// Sparkle House AI helper: a Cloudflare Worker that keeps your Anthropic API key
// off the phone and forwards photos to Claude.
//
// Secrets / variables (set in the Cloudflare dashboard or with wrangler):
//   ANTHROPIC_API_KEY  (secret, required)  your Claude API key
//   APP_TOKEN          (secret, recommended) household passcode the app must send
//   ALLOWED_ORIGINS    (variable, optional) e.g. "https://yourname.github.io"
//   MODEL_ANALYZE      (variable, optional) default claude-sonnet-5-5
//   MODEL_VERIFY       (variable, optional) default claude-haiku-5-5
//
// Photos are passed straight through to the API and never stored here.

const ZONES = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];
const CATEGORIES = ['trash', 'put-away', 'laundry', 'dishes', 'surfaces', 'floors', 'other'];
const MAX_BODY = 9 * 1024 * 1024;

const ANALYZE_SYSTEM = `You help a family turn a photo of a messy room into a short, friendly cleaning checklist for a chore game.

Rules:
- Only list things you can actually see in the photo. Never invent objects.
- Each task names the specific visible object and, when it's obvious, where it should go. Example: "Put the cereal box back in the pantry".
- Group small identical items into one task, such as "Pick up the 6 toy cars".
- Skip anything that already looks tidy. Do not mention or describe any people in the photo.
- Order tasks in a sensible cleaning flow: trash first, then things to put away, then surfaces, then floors.
- Points reflect effort: 2-5 for a quick grab, 6-12 for a few minutes of work, 13-25 for a big job.
- "zone" is the ninth of the photo where the item sits: one of ${ZONES.join(', ')}.
- Return 3 to 12 tasks. If the room already looks tidy, return no tasks and say so in the summary. If the photo isn't of a room, return no tasks and say what you see in the summary.

Give your answer by calling the chore_list tool.`;

const VERIFY_SYSTEM = `You check progress in a family chore game. You get the open chores for a room, a recent AFTER photo, and usually a BEFORE photo taken when the list was made.

Rules:
- The camera may have moved a little between photos. Compare the same areas, using each task's zone as a hint.
- A person may be in the AFTER photo. Ignore them and don't describe them.
- Mark a task done only when the AFTER photo clearly shows it is finished. If the area is hidden, blocked, or out of frame, do not mark it done.
- Be fair but encouraging. Never mark a task done just to be nice.

Give your answer by calling the progress_check tool.`;

// Tools force Claude to answer in a fixed structure instead of free text.
const CHORE_TOOL = {
  name: 'chore_list',
  description: 'Return the chore list for the room in the photo.',
  input_schema: {
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
            zone: { type: 'string', enum: ZONES },
            points: { type: 'integer', minimum: 1, maximum: 25 },
            minutes: { type: 'integer', minimum: 1, maximum: 90 },
            category: { type: 'string', enum: CATEGORIES }
          },
          required: ['title', 'zone', 'points', 'minutes', 'category']
        }
      }
    },
    required: ['summary', 'tasks']
  }
};
const PROGRESS_TOOL = {
  name: 'progress_check',
  description: 'Report which open chores are clearly finished in the AFTER photo.',
  input_schema: {
    type: 'object',
    properties: {
      done: { type: 'array', items: { type: 'string' }, description: 'IDs of chores that are clearly finished.' },
      blocked: { type: 'array', items: { type: 'string' }, description: 'IDs of chores whose area is hidden or out of frame.' },
      feedback: { type: 'string', description: 'One upbeat line, max 14 words. Name what was finished, or nudge toward an easy remaining chore.' }
    },
    required: ['done', 'feedback']
  }
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

    if (url.pathname === '/health') return reply({ ok: true });
    if (request.method !== 'POST') return reply({ error: 'Not found' }, 404);

    const len = Number(request.headers.get('Content-Length') || 0);
    if (len > MAX_BODY) return reply({ error: 'That photo is too large.' }, 413);

    let body;
    try { body = await request.json(); } catch { return reply({ error: 'Bad request.' }, 400); }

    try {
      if (url.pathname === '/analyze') return reply(await analyze(body, env));
      if (url.pathname === '/verify') return reply(await verify(body, env));
      return reply({ error: 'Not found' }, 404);
    } catch (err) {
      return reply({ error: err.message || 'The AI helper hit a problem.' }, err.status || 502);
    }
  }
};

async function analyze(body, env) {
  if (!isB64(body.image)) throw badRequest('No photo received.');
  const room = String(body.room || 'room').slice(0, 40);
  const j = await askClaude(env, env.MODEL_ANALYZE || 'claude-sonnet-5-5', ANALYZE_SYSTEM, [
    imageBlock(body.image),
    { type: 'text', text: `This is the ${room}. Make the chore list.` }
  ], CHORE_TOOL, 4000);
  const tasks = (Array.isArray(j.tasks) ? j.tasks : []).slice(0, 15).map((t) => ({
    title: String(t.title || '').trim().slice(0, 90),
    detail: String(t.detail || '').trim().slice(0, 120),
    zone: ZONES.includes(t.zone) ? t.zone : 'center',
    points: clampNum(t.points, 1, 25, 4),
    minutes: clampNum(t.minutes, 1, 90, 2),
    category: CATEGORIES.includes(t.category) ? t.category : 'other'
  })).filter((t) => t.title);
  return { room_guess: String(j.room_guess || '').slice(0, 40), summary: String(j.summary || '').slice(0, 200), tasks };
}

async function verify(body, env) {
  if (!isB64(body.after)) throw badRequest('No photo received.');
  const tasks = (Array.isArray(body.tasks) ? body.tasks : []).slice(0, 30).map((t) => ({
    id: String(t.id).slice(0, 20), title: String(t.title || '').slice(0, 90), zone: t.zone || 'unknown'
  }));
  if (!tasks.length) return { done: [], blocked: [], feedback: 'Everything is already done!' };
  const content = [];
  if (isB64(body.before)) content.push({ type: 'text', text: 'BEFORE photo:' }, imageBlock(body.before));
  content.push({ type: 'text', text: 'AFTER photo:' }, imageBlock(body.after));
  content.push({ type: 'text', text: `Open chores:\n${JSON.stringify(tasks)}` });
  const j = await askClaude(env, env.MODEL_VERIFY || 'claude-haiku-5-5', VERIFY_SYSTEM, content, PROGRESS_TOOL, 1000);
  const ids = new Set(tasks.map((t) => t.id));
  return {
    done: (Array.isArray(j.done) ? j.done : []).map(String).filter((id) => ids.has(id)),
    blocked: (Array.isArray(j.blocked) ? j.blocked : []).map(String).filter((id) => ids.has(id)),
    feedback: String(j.feedback || '').slice(0, 140)
  };
}

async function askClaude(env, model, system, content, tool, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens, system,
      tools: [tool], tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content }]
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data && data.error && data.error.message ? data.error.message : `status ${res.status}`;
    throw new Error(`Claude API error: ${msg}`);
  }
  const blocks = data.content || [];
  const call = blocks.find((b) => b.type === 'tool_use' && b.input && typeof b.input === 'object');
  if (call) return call.input;
  // Fallback: the answer came back as text. Try to pull JSON out of it.
  const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try { return parseJSON(text); } catch (e) {
    console.log('Unparseable answer', { stop_reason: data.stop_reason, text: text.slice(0, 500) });
    throw e;
  }
}

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
