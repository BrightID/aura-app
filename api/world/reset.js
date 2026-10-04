import { read, write, roomFrom, body, misconfigured, clearClaims, validWorld } from "../_store.js";

// POST /api/world/reset?room=R  { teamCode, keep? } -> 200 { version, generation }
// keep is the part of the world that survives the reset (the real people and
// what passed between them); without it the room goes back to the seed alone.
// TEAM_CODE is set on the server.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (misconfigured) return res.status(500).json({ error: "server has no Redis configured" });
  const room = roomFrom(req);
  if (!room) return res.status(400).json({ error: "bad room" });
  const { teamCode, keep = null } = await body(req).catch(() => ({}));
  if (!process.env.TEAM_CODE || teamCode !== process.env.TEAM_CODE)
    return res.status(403).json({ error: "wrong team code" });
  if (keep !== null) {
    const bad = validWorld(keep);
    if (bad) return res.status(400).json({ error: "keep: " + bad });
  }
  for (let i = 0; i < 5; i++) {
    const { version } = await read(room);
    const r = await write(room, version, 0, keep, true);
    if (r.ok) { await clearClaims(room); return res.status(200).json({ version: r.version, generation: r.generation }); }
  }
  return res.status(503).json({ error: "busy, try again" });
}
