import { claim, roomFrom, body, misconfigured } from "./_store.js";

// POST /api/claim?room=R  { token, id } -> 200 { claimedBy: id } when this caller won,
//                                         409 { claimedBy } when someone else already had.
export default async function handler(req, res) {
  if (misconfigured) return res.status(500).json({ error: "server has no Redis configured" });
  if (req.method !== "POST") return res.status(405).end();
  const room = roomFrom(req);
  if (!room) return res.status(400).json({ error: "bad room" });
  const { token, id } = await body(req).catch(() => ({}));
  if (typeof token !== "string" || !/^[0-9a-f]{32}$/.test(token) || typeof id !== "string" || !/^[\w-]{1,80}$/.test(id))
    return res.status(400).json({ error: "send { token, id }" });
  const winner = await claim(room, token, id);
  return res.status(winner === id ? 200 : 409).json({ claimedBy: winner });
}
