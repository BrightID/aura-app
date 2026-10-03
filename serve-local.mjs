// Runs the real API handlers (in-memory store) plus the page, for end-to-end tests:
// TEAM_CODE=check PORT=4811 node serve-local.mjs
import http from "node:http";
import fs from "node:fs";
import world from "./api/world.js";
import reset from "./api/world/reset.js";
import presence from "./api/presence.js";
import claimH from "./api/claim.js";
const routes = { "/api/world": world, "/api/world/reset": reset, "/api/presence": presence, "/api/claim": claimH };
http.createServer(async (req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  const h = routes[path];
  if (!h) { res.writeHead(200, { "Content-Type": "text/html" }); return res.end(fs.readFileSync("public/index.html")); }
  const shim = { status(s) { res.statusCode = s; return shim; }, json(j) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(j)); return shim; }, end() { res.end(); return shim; }, setHeader: (k, v) => res.setHeader(k, v) };
  await h(req, shim);
}).listen(process.env.PORT || 4811, () => console.log("serving on", process.env.PORT || 4811));
