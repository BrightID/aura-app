import { read, write, roomFrom, body, misconfigured, clearClaims } from "../_store.js";

// POST /api/world/reset?room=R  { teamCode } -> 200 { version, generation }
// Puts the room back to the seed for everyone. TEAM_CODE is set on the server.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (misconfigured) return res.status(500).json({ error: "server has no Redis configured" });
  const room = roomFrom(req);
  if (!room) return res.status(400).json({ error: "bad room" });
  const { teamCode } = await body(req).catch(() => ({}));
  if (!process.env.TEAM_CODE || teamCode !== process.env.TEAM_CODE)
    return res.status(403).json({ error: "wrong team code" });
  for (let i = 0; i < 5; i++) {
    const { version } = await read(room);
    const r = await write(room, version, 0, null, true);
    if (r.ok) { await clearClaims(room); return res.status(200).json({ version: r.version, generation: r.generation }); }
  }
  return res.status(503).json({ error: "busy, try again" });
}
