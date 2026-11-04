// Worker dos sites da Ametista Seeds (mesmo padrão do Tudukit).
// Entrega o site estático (ASSETS) e trata só de /api/*:
//   /api/contato  → formulário de contato → e-mail para ametistaseeds@gmail.com (binding send_email CONTACT_EMAIL)
//   /api/hit, /api/err, /api/ev → estatística anônima (D1 "sites-stats"): só totais por dia, sem cookies, sem IP.
// Configuração por site em wrangler.jsonc → "vars": SITE_NAME, FROM_ADDRESS, HOSTS (lista separada por vírgulas).
// Pré-visualizações não herdam os bindings: aí o formulário responde 503 e a estatística não grava (esperado).

const TO_ADDRESS = "ametistaseeds@gmail.com";
const EVENTS = ["contato-enviado", "play-video", "clique-streaming", "apoio-clique"];
const BOT_UA = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor/i;
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

const clean = (v, max) => String(v ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);
const today = () => new Date().toISOString().slice(0, 10);
const hostsOf = (env) => String(env.HOSTS || "").split(",").map((h) => h.trim()).filter(Boolean);
const isPreviewHost = (host) => /\.ametistaseeds\.workers\.dev$/.test(host);

function allowedOrigin(origin, env) {
  if (!origin) return false;
  try {
    const h = new URL(origin).hostname;
    return hostsOf(env).includes(h) || isPreviewHost(h);
  } catch {
    return false;
  }
}

function json(body, status, origin, env) {
  const cors = allowedOrigin(origin, env)
    ? { "access-control-allow-origin": origin, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", vary: "origin" }
    : {};
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...cors },
  });
}

async function handleContact(request, env, ctx) {
  const origin = request.headers.get("origin") || "";
  if (request.method === "OPTIONS") return json(null, 204, origin, env);
  if (request.method !== "POST") return json({ ok: false, error: "method" }, 405, origin, env);
  if (origin && !allowedOrigin(origin, env)) return json({ ok: false, error: "origin" }, 403, origin, env);

  let d;
  try {
    d = await request.json();
  } catch {
    return json({ ok: false, error: "json" }, 400, origin, env);
  }
  const name = clean(d.name, 120);
  const email = clean(d.email, 200);
  const message = clean(d.message, 5000);
  const lang = clean(d.lang, 5);
  const page = clean(d.page, 300);

  // Anti-spam simples: campo escondido preenchido ou envio rápido demais → aceita em silêncio, não envia.
  if (clean(d.website, 200) || Number(d.ms) < 3000) return json({ ok: true }, 200, origin, env);
  if (!EMAIL_RE.test(email) || !message) return json({ ok: false, error: "fields" }, 400, origin, env);
  if (!env.CONTACT_EMAIL || !env.FROM_ADDRESS) return json({ ok: false, error: "unavailable" }, 503, origin, env);

  const site = env.SITE_NAME || new URL(request.url).hostname;
  const text = [
    `Nova mensagem do formulário de contato (${site}).`,
    "",
    `Nome: ${name || "(não indicado)"}`,
    `E-mail: ${email}`,
    `Idioma da página: ${lang || "?"}`,
    `Página: ${page || "?"}`,
    `Recebida: ${new Date().toISOString()}`,
    "",
    "Mensagem:",
    message,
    "",
    "— Responder a este e-mail responde direto a quem escreveu.",
  ].join("\n");

  try {
    await env.CONTACT_EMAIL.send({
      to: TO_ADDRESS,
      from: { email: env.FROM_ADDRESS, name: `Formulário ${site}` },
      replyTo: name ? { email, name } : email,
      subject: `[Formulário ${site}] ${name || email}`,
      text,
    });
  } catch (e) {
    console.error("contact send failed", e && e.code, e && e.message);
    return json({ ok: false, error: "send" }, 502, origin, env);
  }
  if (env.STATS) {
    ctx.waitUntil(
      env.STATS.prepare("INSERT INTO events (day,host,name,n) VALUES (?,?,?,1) ON CONFLICT(day,host,name) DO UPDATE SET n=n+1")
        .bind(today(), new URL(request.url).hostname, "contato-enviado")
        .run()
        .catch(() => {})
    );
  }
  return json({ ok: true }, 200, origin, env);
}

async function handleStat(request, env, ctx, kind) {
  const done = new Response(null, { status: 204 });
  if (request.method !== "POST" || !env.STATS) return done;
  const host = new URL(request.url).hostname;
  if (!hostsOf(env).includes(host) || BOT_UA.test(request.headers.get("user-agent") || "")) return done;
  let d;
  try {
    d = await request.json();
  } catch {
    return done;
  }
  const path = clean(d.p, 200);
  if (!path.startsWith("/")) return done;
  let stmt;
  if (kind === "hit") {
    const ref = clean(d.r, 100).toLowerCase().replace(/[^a-z0-9.-]/g, "");
    const country = clean(request.cf && request.cf.country, 2) || "??";
    stmt = env.STATS.prepare(
      "INSERT INTO hits (day,host,path,country,ref,n) VALUES (?,?,?,?,?,1) ON CONFLICT(day,host,path,country,ref) DO UPDATE SET n=n+1"
    ).bind(today(), host, path, country, ref);
  } else if (kind === "err") {
    stmt = env.STATS.prepare(
      "INSERT INTO errors (day,host,path,msg,n) VALUES (?,?,?,?,1) ON CONFLICT(day,host,path,msg) DO UPDATE SET n=n+1"
    ).bind(today(), host, path, clean(d.m, 200) || "?");
  } else {
    const name = clean(d.e, 40);
    if (!EVENTS.includes(name)) return done;
    stmt = env.STATS.prepare(
      "INSERT INTO events (day,host,name,n) VALUES (?,?,?,1) ON CONFLICT(day,host,name) DO UPDATE SET n=n+1"
    ).bind(today(), host, name);
  }
  ctx.waitUntil(stmt.run().catch((e) => console.error("stat failed", e && e.message)));
  return done;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/contato") return handleContact(request, env, ctx);
    if (url.pathname === "/api/hit") return handleStat(request, env, ctx, "hit");
    if (url.pathname === "/api/err") return handleStat(request, env, ctx, "err");
    if (url.pathname === "/api/ev") return handleStat(request, env, ctx, "ev");
    return env.ASSETS.fetch(request);
  },
};
