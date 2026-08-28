/**
 * Cloudflare Worker: GitHub OAuth code exchange + McNicol-Lab org check.
 * Secrets (wrangler secret put): GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
 * Never commit the client secret.
 */
const ORG = "McNicol-Lab";
const ALLOWED_ORIGINS = [
  "https://mcnicol-lab.github.io",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
];

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    const cors = {
      "Access-Control-Allow-Origin": allow,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);

    if (url.pathname === "/auth/github" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "bad json" }, 400, cors); }
      const code = body && body.code;
      if (!code) return json({ error: "missing code" }, 400, cors);
      if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
        return json({ error: "server missing GitHub secrets" }, 500, cors);
      }
      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });
      const tokenJson = await tokenRes.json();
      if (!tokenJson.access_token) {
        return json({ error: tokenJson.error || "token exchange failed" }, 401, cors);
      }
      const membership = await checkOrg(tokenJson.access_token);
      if (!membership.ok) {
        return json({ error: "not a McNicol-Lab member", login: membership.login }, 403, cors);
      }
      return json({
        token: tokenJson.access_token,
        login: membership.login,
        name: membership.name,
        avatar: membership.avatar,
        org: ORG,
      }, 200, cors);
    }

    if (url.pathname === "/auth/whoami" && request.method === "GET") {
      const auth = request.headers.get("Authorization") || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!token) return json({ error: "missing token" }, 401, cors);
      const membership = await checkOrg(token);
      if (!membership.ok) return json({ error: "not a McNicol-Lab member" }, 403, cors);
      return json(membership, 200, cors);
    }

    return json({ ok: true, service: "ecophilab-auth" }, 200, cors);
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

async function checkOrg(token) {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "ecophilab-skill-tree",
  };
  const me = await fetch("https://api.github.com/user", { headers });
  if (!me.ok) return { ok: false };
  const user = await me.json();
  const mem = await fetch(`https://api.github.com/orgs/${ORG}/members/${user.login}`, { headers });
  // 204 = member (public or private, depending on token). 302/404 = not a member.
  const ok = mem.status === 204 || mem.status === 200;
  return {
    ok,
    login: user.login,
    name: user.name || user.login,
    avatar: user.avatar_url,
    org: ORG,
  };
}
