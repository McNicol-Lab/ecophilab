/* ecoϕlab skill tree — members-only, GitHub org McNicol-Lab */
(function () {
  const AUTH = window.ECOPHILAB_AUTH || { org: "McNicol-Lab", clientId: "", authProxyUrl: "" };
  const SESSION = "ecophilab-auth";
  const root = document.getElementById("st-root");
  if (!root) return;

  const state = {
    user: null,
    trees: null,
    roleId: null,
    selected: null,
    done: {},
  };

  function storageKey(login) {
    return "ecophilab-tree:" + login;
  }

  function loadDone(login) {
    try {
      return JSON.parse(localStorage.getItem(storageKey(login)) || "{}") || {};
    } catch {
      return {};
    }
  }

  function saveDone() {
    if (!state.user) return;
    localStorage.setItem(storageKey(state.user.login), JSON.stringify(state.done));
  }

  function isLocalHost() {
    return /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  }

  function sessionUser() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION) || "null");
    } catch {
      return null;
    }
  }

  async function boot() {
    const params = new URLSearchParams(location.search);
    if (params.get("code")) {
      await exchangeCode(params.get("code"), params.get("state"));
      history.replaceState({}, "", location.pathname);
    }
    state.user = sessionUser();
    if (state.user) {
      await loadTrees();
      renderApp();
      return;
    }
    if (isLocalHost()) {
      state.user = { login: "local-preview", name: "Local preview", avatar: "" };
      await loadTrees();
      renderApp();
      return;
    }
    renderGate();
  }

  function renderGate() {
    const ready = Boolean(AUTH.clientId && AUTH.authProxyUrl);
    root.innerHTML = `
      <div class="st-gate">
        <p class="st-kicker">ecoϕlab · members only</p>
        <h2>Skill tree</h2>
        <p>Sign in with GitHub. Access is limited to members of the <strong>${AUTH.org}</strong> organization.</p>
        ${ready
          ? `<button class="st-btn" type="button" id="st-login">Sign in with GitHub</button>`
          : `<p class="st-error">GitHub OAuth is not wired yet. After this page is live, create an OAuth App on McNicol-Lab (callback <code>https://mcnicol-lab.github.io/ecophilab/skill-tree.html</code>), deploy <code>auth/worker.js</code> on Cloudflare, then put the client id and worker URL in <code>skill-tree/config.js</code>. Never commit the client secret.</p>
             <p>Until then, the trees still render on localhost for editing.</p>`}
      </div>`;
    const btn = document.getElementById("st-login");
    if (btn) btn.addEventListener("click", startLogin);
  }

  function startLogin() {
    const redirect = location.origin + (AUTH.callbackPath || location.pathname);
    const nonce = crypto.randomUUID();
    sessionStorage.setItem("st-oauth-state", nonce);
    const url =
      "https://github.com/login/oauth/authorize" +
      "?client_id=" + encodeURIComponent(AUTH.clientId) +
      "&redirect_uri=" + encodeURIComponent(redirect) +
      "&scope=" + encodeURIComponent("read:user read:org") +
      "&state=" + encodeURIComponent(nonce);
    location.href = url;
  }

  async function exchangeCode(code, returnedState) {
    const expected = sessionStorage.getItem("st-oauth-state");
    if (returnedState && expected && returnedState !== expected) {
      root.innerHTML = `<div class="st-gate"><p class="st-error">OAuth state mismatch. Try signing in again.</p></div>`;
      return;
    }
    if (!AUTH.authProxyUrl) return;
    try {
      const res = await fetch(AUTH.authProxyUrl.replace(/\/$/, "") + "/auth/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "auth failed");
      sessionStorage.setItem(SESSION, JSON.stringify({
        login: data.login,
        name: data.name,
        avatar: data.avatar,
        token: data.token,
        org: data.org,
      }));
    } catch (err) {
      root.innerHTML = `<div class="st-gate"><p class="st-error">${escapeHtml(err.message)}</p></div>`;
      throw err;
    }
  }

  async function loadTrees() {
    const res = await fetch("skill-tree/trees.json");
    state.trees = await res.json();
    const roles = state.trees.roles || [];
    state.roleId = (roles[0] && roles[0].id) || null;
    state.done = loadDone(state.user.login);
  }

  function currentRole() {
    return (state.trees.roles || []).find((r) => r.id === state.roleId) || state.trees.roles[0];
  }

  function isDone(id) {
    return Boolean(state.done[id]);
  }

  function isLocked(node) {
    return (node.requires || []).some((id) => !isDone(id));
  }

  function renderApp() {
    const role = currentRole();
    const nodes = role.nodes || [];
    const nDone = nodes.filter((n) => isDone(n.id)).length;
    const pct = nodes.length ? Math.round((nDone / nodes.length) * 100) : 0;
    const branches = [];
    for (const n of nodes) {
      if (!branches.includes(n.branch)) branches.push(n.branch);
    }
    const selected = nodes.find((n) => n.id === state.selected) || null;

    root.innerHTML = `
      <div class="st-app">
        <div class="st-head">
          <div>
            <p class="st-kicker">${escapeHtml(state.trees.lab || "ecoϕlab")}</p>
            <h2>Skill tree</h2>
            <p class="st-blurb">${escapeHtml(role.blurb || "")}</p>
          </div>
          <div class="st-who">
            ${state.user.avatar ? `<img alt="" src="${escapeAttr(state.user.avatar)}">` : ""}
            <span>${escapeHtml(state.user.name || state.user.login)}</span>
            ${isLocalHost() ? "" : `<button class="st-btn ghost" type="button" id="st-out">Sign out</button>`}
          </div>
        </div>
        <div class="st-roles" role="tablist">
          ${(state.trees.roles || []).map((r) =>
            `<button type="button" class="st-role" data-role="${escapeAttr(r.id)}" aria-pressed="${r.id === role.id}">${escapeHtml(r.name)}</button>`
          ).join("")}
        </div>
        <div class="st-progress" aria-label="${pct} percent complete"><span style="width:${pct}%"></span></div>
        <div class="st-tree">
          ${branches.map((b) => {
            const group = nodes.filter((n) => n.branch === b);
            return `<section class="st-branch">
              <h3>${escapeHtml(b)}</h3>
              <div class="st-nodes">
                ${group.map((n) => {
                  const locked = isLocked(n);
                  const done = isDone(n.id);
                  return `<button type="button" class="st-node${done ? " done" : ""}${locked ? " locked" : ""}${state.selected === n.id ? " active" : ""}" data-id="${escapeAttr(n.id)}">
                    <span class="dot"></span>
                    <span>${escapeHtml(n.title)}</span>
                  </button>`;
                }).join("")}
              </div>
            </section>`;
          }).join("")}
        </div>
        ${selected ? renderDetail(selected, nodes) : `<p class="st-note">Pick a node. Shared onboarding uses the same ids across roles, so progress carries if you switch trees.</p>`}
        <p class="st-note">${escapeHtml(state.trees.sources_note || "")}</p>
        <div class="st-actions">
          <button class="st-btn ghost" type="button" id="st-export">Export progress</button>
          <label class="st-btn ghost" for="st-import">Import progress
            <input id="st-import" type="file" accept="application/json" hidden>
          </label>
        </div>
      </div>`;

    root.querySelectorAll("[data-role]").forEach((el) => {
      el.addEventListener("click", () => {
        state.roleId = el.getAttribute("data-role");
        state.selected = null;
        renderApp();
      });
    });
    root.querySelectorAll("[data-id]").forEach((el) => {
      el.addEventListener("click", () => {
        state.selected = el.getAttribute("data-id");
        renderApp();
      });
    });
    const out = document.getElementById("st-out");
    if (out) out.addEventListener("click", () => {
      sessionStorage.removeItem(SESSION);
      state.user = null;
      renderGate();
    });
    const mark = document.getElementById("st-toggle");
    if (mark) mark.addEventListener("click", () => {
      if (!selected) return;
      if (isLocked(selected) && !isDone(selected.id)) return;
      state.done[selected.id] = !isDone(selected.id);
      if (!state.done[selected.id]) delete state.done[selected.id];
      saveDone();
      renderApp();
    });
    document.getElementById("st-export")?.addEventListener("click", exportProgress);
    document.getElementById("st-import")?.addEventListener("change", importProgress);
  }

  function renderDetail(node, nodes) {
    const locked = isLocked(node);
    const done = isDone(node.id);
    const req = (node.requires || [])
      .map((id) => (nodes.find((n) => n.id === id) || { id, title: id }))
      .map((n) => `${n.title}${isDone(n.id) ? "" : " (open)"}`)
      .join(", ");
    const links = (node.links || [])
      .map((l) => `<li><a href="${escapeAttr(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.label)}</a></li>`)
      .join("");
    return `<aside class="st-detail">
      <h3>${escapeHtml(node.title)}</h3>
      <p>${escapeHtml(node.description || "")}</p>
      ${req ? `<p>Needs first: ${escapeHtml(req)}</p>` : ""}
      ${links ? `<ul class="st-links">${links}</ul>` : ""}
      <div class="st-actions">
        <button class="st-btn" type="button" id="st-toggle" ${locked && !done ? "disabled" : ""}>
          ${done ? "Mark as not done" : "Mark as done"}
        </button>
      </div>
    </aside>`;
  }

  function exportProgress() {
    const blob = new Blob([JSON.stringify({ login: state.user.login, done: state.done }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ecophilab-skill-tree-progress.json";
    a.click();
  }

  function importProgress(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || "{}"));
        state.done = data.done || data || {};
        saveDone();
        renderApp();
      } catch {
        alert("Could not read that progress file.");
      }
    };
    reader.readAsText(file);
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  boot();
})();
