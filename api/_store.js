// One compare-and-set slot per room: { version, generation, world }.
// generation goes up only on reset; a write from an older generation is refused,
// so a stale tab can't bring back a world that was reset.
// Uses Upstash Redis over REST when KV_REST_API_URL is set; otherwise an
// in-memory map, which is enough for local runs and tests.

const URL_ = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;
// On Vercel, a missing Redis would silently give each instance its own world.
export const misconfigured = Boolean(process.env.VERCEL) && !(URL_ && TOKEN);
export const MAX_WORLD_BYTES = 300_000;
const PARTS = ["identities", "answers", "outgoing", "arrivalCodes", "playerRequests", "nodes", "nameGrants",
  "controlRelationships", "nodesComplete", "sharedControlAnswered", "arrivalRole", "teamAsked",
  "nodeAnswered", "nodeAddress", "nodeReady", "nameVisibility"];
const plain = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
// A world is a plain object whose known parts are plain objects (maps keyed by record key).
// Unknown parts are allowed so the app can add parts without a server change.
export function validWorld(world) {
  if (!plain(world)) return "world must be an object";
  for (const part of PARTS) if (part in world && !plain(world[part])) return `world.${part} must be an object`;
  if (JSON.stringify(world).length > MAX_WORLD_BYTES) return "world too large";
  return null;
}
const TTL_SECONDS = 14 * 24 * 3600;
const memory = new Map();

// ARGV: baseVersion, generation, world json, ttl, isReset.
// Returns [1, newVersion, generation] on success or [0, version, generation, world] on conflict.
const CAS = `
local cur = redis.call('HGET', KEYS[1], 'v') or '0'
local gen = redis.call('HGET', KEYS[1], 'g') or '1'
if cur ~= ARGV[1] or (ARGV[5] ~= '1' and gen ~= ARGV[2]) then
  return {0, cur, gen, redis.call('HGET', KEYS[1], 'w') or ''}
end
local nv = tostring(tonumber(cur) + 1)
if ARGV[5] == '1' then gen = tostring(tonumber(gen) + 1) end
redis.call('HSET', KEYS[1], 'v', nv, 'g', gen, 'w', ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
return {1, nv, gen}`;

async function redis(command) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const body = await r.json();
  if (body.error) throw new Error(body.error);
  return body.result;
}

const key = (room) => `aura-practice:room:${room}`;

// Generations start at 1: the app treats 0 as "not loaded yet".
const EMPTY = { version: 0, generation: 1, world: null };

export async function read(room) {
  if (!URL_) return { ...(memory.get(room) || EMPTY) };
  const [v, g, w] = await redis(["HMGET", key(room), "v", "g", "w"]);
  return { version: Number(v || 0), generation: Number(g || 1), world: w ? JSON.parse(w) : null };
}

// reset=true ignores the caller's generation and starts a new one.
export async function write(room, baseVersion, generation, world, reset = false) {
  const json = world === null ? "" : JSON.stringify(world);
  if (!URL_) {
    const slot = memory.get(room) || EMPTY;
    if (slot.version !== baseVersion || (!reset && slot.generation !== generation)) return { ok: false, ...slot };
    const next = { version: slot.version + 1, generation: slot.generation + (reset ? 1 : 0), world };
    memory.set(room, next);
    return { ok: true, version: next.version, generation: next.generation };
  }
  const res = await redis(["EVAL", CAS, "1", key(room), String(baseVersion), String(generation), json, String(TTL_SECONDS), reset ? "1" : "0"]);
  if (Number(res[0]) === 1) return { ok: true, version: Number(res[1]), generation: Number(res[2]) };
  return { ok: false, version: Number(res[1]), generation: Number(res[2]), world: res[3] ? JSON.parse(res[3]) : null };
}

// Presence lives outside the world so heartbeats never collide with real writes.
const presenceKey = (room) => `aura-practice:presence:${room}`;
const presenceMemory = new Map();
export async function beat(room, browserId, persona) {
  const entry = JSON.stringify({ persona, at: Date.now() });
  if (!URL_) {
    const m = presenceMemory.get(room) || new Map();
    m.set(browserId, entry); presenceMemory.set(room, m); return;
  }
  await redis(["HSET", presenceKey(room), browserId, entry]);
  await redis(["EXPIRE", presenceKey(room), String(TTL_SECONDS)]);
}
export async function present(room, withinMs = 30000) {
  const raw = !URL_ ? Object.fromEntries(presenceMemory.get(room) || []) : await redis(["HGETALL", presenceKey(room)]);
  const pairs = Array.isArray(raw) ? Object.fromEntries(raw.reduce((a, x, i) => (i % 2 ? a[a.length - 1].push(x) : a.push([x]), a), [])) : raw;
  const now = Date.now();
  return Object.entries(pairs || {}).map(([browserId, v]) => ({ browserId, ...JSON.parse(v) })).filter((p) => now - p.at < withinMs);
}

export function roomFrom(req) {
  const room = new URL(req.url, "http://x").searchParams.get("room") || "";
  return /^[a-z0-9-]{3,40}$/.test(room) ? room : null;
}

export async function body(req) {
  if (req.body && typeof req.body === "object") {
    if (JSON.stringify(req.body).length > 2_000_000) throw new Error("too large");
    return req.body;
  }
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2_000_000) throw new Error("too large");
  }
  return raw ? JSON.parse(raw) : {};
}

// One winner per invite token: the first claim sticks, later ones learn who won.
const claimKey = (room) => `aura-practice:claims:${room}`;
const claimMemory = new Map();
export async function claim(room, token, id) {
  if (!URL_) {
    const m = claimMemory.get(room) || new Map();
    claimMemory.set(room, m);
    if (!m.has(token)) m.set(token, id);
    return m.get(token);
  }
  await redis(["HSETNX", claimKey(room), token, id]);
  await redis(["EXPIRE", claimKey(room), String(TTL_SECONDS)]);
  return await redis(["HGET", claimKey(room), token]);
}
export async function clearClaims(room) {
  if (!URL_) return claimMemory.delete(room);
  await redis(["DEL", claimKey(room)]);
}
