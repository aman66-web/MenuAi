// Serves the iPhone app's copy of the web app (npm run build:app → .next-app/) the way the app's own file server does
// (MenuMacros/App/WebApp/BundleSchemeHandler.swift): the query is ignored, then the exact file, then "<path>.html", then "<path>/index.html",
// else 404.html. Lets the browser tests check the packed app on this computer: PORT=3103 node e2e/serve-app.mjs [dir]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".next-app");
const port = Number(process.env.PORT ?? 3103);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".map": "application/json", ".webmanifest": "application/manifest+json",
};

async function isFile(p) {
  try { return (await stat(p)).isFile(); } catch { return false; }
}

/** The same lookup as the Swift handler. Returns a path inside root, or null. */
export async function lookup(urlPath) {
  let path = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  if (!path.startsWith("/")) path = "/" + path;
  const clean = normalize(path).replace(/^(\.\.[/\\])+/, "");
  const base = join(root, clean);
  if (!base.startsWith(root)) return null;
  const candidates = clean.endsWith("/") ? [join(base, "index.html"), base.replace(/\/$/, "") + ".html"] : [base, base + ".html", join(base, "index.html")];
  for (const c of candidates) if (await isFile(c)) return c;
  return null;
}

createServer(async (req, res) => {
  const file = await lookup(req.url ?? "/");
  const target = file ?? join(root, "404.html");
  try {
    const body = await readFile(target);
    res.writeHead(file ? 200 : 404, { "Content-Type": TYPES[extname(target)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
