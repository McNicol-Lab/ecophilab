# ecoϕlab skill tree (members only)

Five role trees (lab aide, master’s, PhD, postdoc, lab manager) behind GitHub login, restricted to the McNicol-Lab org.

## After merge

1. Create a GitHub OAuth App on the McNicol-Lab org
   - Homepage: `https://mcnicol-lab.github.io/ecophilab/`
   - Callback: `https://mcnicol-lab.github.io/ecophilab/skill-tree.html`
2. Deploy `auth/worker.js` as a Cloudflare Worker
   - `wrangler secret put GITHUB_CLIENT_ID`
   - `wrangler secret put GITHUB_CLIENT_SECRET`
3. Put the client id and worker URL in `skill-tree/config.js` (`clientId`, `authProxyUrl`). Never commit the secret.
4. Republish Pages (`quarto publish gh-pages` from `main`, because Pages is the `gh-pages` branch).

Progress is stored in the browser (`localStorage` keyed by GitHub login) with export/import JSON.
