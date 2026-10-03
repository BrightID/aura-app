import { beat, present, roomFrom, body, misconfigured } from "./_store.js";

// POST /api/presence?room=R  { browserId, persona } -> 200 { here: [...] }
// GET  /api/presence?room=R  -> { here: [{ browserId, persona, at }] }  (seen in the last 30 s)
export default async function handler(req, res) {
  if (misconfigured) return res.status(500).json({ error: "server has no Redis configured" });
  const room = roomFrom(req);
  if (!room) return res.status(400).json({ error: "bad room" });
  try {
    if (req.method === "POST") {
      const { browserId, persona } = await body(req);
      if (typeof browserId !== "string" || !/^[\w-]{6,64}$/.test(browserId) || typeof persona !== "string" || persona.length > 80)
        return res.status(400).json({ error: "send { browserId, persona }" });
      await beat(room, browserId, persona);
    } else if (req.method !== "GET") return res.status(405).end();
    return res.status(200).json({ here: await present(room) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
