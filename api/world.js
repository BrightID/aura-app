import { read, write, roomFrom, body, validWorld, misconfigured } from "./_store.js";

// GET  /api/world?room=R  -> { version, generation, world }
// PUT  /api/world?room=R  { baseVersion, generation, world }
//   -> 200 { version, generation } | 409 { version, generation, world }
// On a 409 whose generation differs from yours, the room was reset: drop your
// local world and take the server's instead of merging.
export default async function handler(req, res) {
  if (misconfigured) return res.status(500).json({ error: "server has no Redis configured" });
  const room = roomFrom(req);
  if (!room) return res.status(400).json({ error: "room must be 3-40 lowercase letters, digits or dashes" });
  try {
    if (req.method === "GET") return res.status(200).json(await read(room));
    if (req.method === "PUT") {
      const { baseVersion, generation, world } = await body(req);
      if (!Number.isInteger(baseVersion) || !Number.isInteger(generation))
        return res.status(400).json({ error: "send { baseVersion, generation, world }" });
      const bad = validWorld(world);
      if (bad) return res.status(bad === "world too large" ? 413 : 400).json({ error: bad });
      const r = await write(room, baseVersion, generation, world);
      return r.ok
        ? res.status(200).json({ version: r.version, generation: r.generation })
        : res.status(409).json({ version: r.version, generation: r.generation, world: r.world });
    }
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).end();
  } catch (e) {
    return res.status(e.message === "too large" ? 413 : 500).json({ error: e.message });
  }
}
