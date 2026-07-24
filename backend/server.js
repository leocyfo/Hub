const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const { createProxyMiddleware } = require('http-proxy-middleware');

const PORT = process.env.PORT || 8080;
const PROJET_DIR = path.join(__dirname, '..', 'projet');
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
// surchageable par le harnais de vérification (jsdom), pour ne jamais toucher
// aux vraies données pendant les tests
const HUB_PROJECTS_DB = process.env.HUB_PROJECTS_DB || path.join(__dirname, 'db', 'hub-projects.json');

// un outil = une route (/<key>), un port local où il tourne, un dossier
// sous projet/. DataSite pose son cookie de session avec Path=/ codé en dur
// côté backend/auth.js : sans réécriture ce cookie ne "collerait" pas au
// préfixe /datasite une fois passé par le proxy.
const TOOLS = [
  { key: 'datasite', port: 3000, dir: path.join(PROJET_DIR, 'DataSite'), cookiePathRewrite: { '/': '/datasite' } },
  { key: 'sitebuilder', port: 4000, dir: path.join(PROJET_DIR, 'SiteBuilder') },
  { key: 'planboard', port: 4500, dir: path.join(PROJET_DIR, 'PlanBoard') },
  { key: 'envkeeper', port: 4600, dir: path.join(PROJET_DIR, 'EnvKeeper') },
  { key: 'snippetbox', port: 4700, dir: path.join(PROJET_DIR, 'SnippetBox') },
  { key: 'moodboard', port: 4800, dir: path.join(PROJET_DIR, 'Moodboard') },
  { key: 'themeforge', port: 4900, dir: path.join(PROJET_DIR, 'ThemeForge') },
  { key: 'flowmap', port: 5000, dir: path.join(PROJET_DIR, 'FlowMap') },
  { key: 'apitester', port: 5100, dir: path.join(PROJET_DIR, 'APITester') },
  { key: 'gdd', port: 5200, dir: path.join(PROJET_DIR, 'GDD') },
];

// mêmes ressources que HUB_TOOLS côté frontend (voir frontend/script.js),
// dupliquées ici car le backend interroge chaque outil directement sur son
// port local plutôt qu'à travers le proxy /<key> (plus simple : pas de
// souci d'origine/cookies pour un simple GET serveur-à-serveur)
// kind/detailPath/summarize servent à la page wiki d'un projet-hub (voir
// GET /api/hub-projects/:name/wiki plus bas) : detailPath n'est défini QUE
// pour les outils dont l'endpoint de liste ne suffit pas (sitebuilder,
// moodboard, flowmap). envkeeper n'a délibérément PAS de detailPath —
// GET /api/vaults/:name renvoie les secrets en clair, cette route ne doit
// donc jamais être atteinte depuis la page wiki.
const SEARCH_RESOURCES = [
  {
    key: 'datasite', label: 'DataSite', path: '/api/databases', idField: 'id', labelField: 'name', linkParam: 'db',
    kind: 'database',
    summarize: (item) => ({
      tables: (item.tables || []).map((t) => ({ name: t.name, rowCount: t.rowCount })),
    }),
  },
  {
    key: 'sitebuilder', label: 'SiteBuilder', path: '/api/projects', idField: 'name', labelField: 'name', linkParam: 'project',
    kind: 'pages',
    detailPath: (item) => `/api/projects/${encodeURIComponent(item.name)}`,
    summarize: (item, detail) => ({
      pageCount: (detail?.pages || []).length,
      pageNames: (detail?.pages || []).map((p) => p.name),
      theme: detail?.theme || null,
    }),
  },
  {
    key: 'planboard', label: 'PlanBoard', path: '/api/projects', idField: 'name', labelField: 'name', linkParam: 'project',
    kind: 'tasks',
    summarize: (item) => ({
      statusCounts: item.statusCounts || { todo: 0, doing: 0, done: 0 },
      noteCount: item.noteCount || 0,
      overdueCount: item.overdueCount || 0,
      pinned: !!item.pinned,
    }),
  },
  {
    key: 'envkeeper', label: 'EnvKeeper', path: '/api/vaults', idField: 'name', labelField: 'name', linkParam: 'vault',
    kind: 'vault',
    // SÉCURITÉ : pas de detailPath ici, volontairement — voir commentaire au
    // dessus de SEARCH_RESOURCES.
    summarize: (item) => ({ entryCount: item.entryCount || 0 }),
  },
  {
    key: 'snippetbox', label: 'SnippetBox', path: '/api/snippets', idField: 'id', labelField: 'title', linkParam: 'snippet',
    kind: 'snippet',
    summarize: (item) => ({
      language: item.language,
      description: item.description || '',
      tags: item.tags || [],
      codePreview: String(item.code || '').slice(0, 400),
      codeTruncated: String(item.code || '').length > 400,
    }),
  },
  {
    key: 'moodboard', label: 'Moodboard', path: '/api/boards', idField: 'name', labelField: 'name', linkParam: 'board',
    kind: 'moodboard',
    detailPath: (item) => `/api/boards/${encodeURIComponent(item.name)}`,
    summarize: (item, detail) => {
      const items = detail?.items || [];
      const countsByType = {};
      const colors = [];
      for (const it of items) {
        countsByType[it.type] = (countsByType[it.type] || 0) + 1;
        if (it.type === 'color') colors.push({ hex: it.hex, label: it.label || '' });
      }
      return { itemCount: items.length, countsByType, colors };
    },
  },
  {
    key: 'themeforge', label: 'ThemeForge', path: '/api/palettes', idField: 'id', labelField: 'name', linkParam: 'palette',
    kind: 'palette',
    summarize: (item) => ({ baseHex: item.baseHex, mode: item.mode, colors: item.colors || [] }),
  },
  {
    key: 'flowmap', label: 'FlowMap', path: '/api/flows', idField: 'name', labelField: 'name', linkParam: 'flow',
    kind: 'flow',
    detailPath: (item) => `/api/flows/${encodeURIComponent(item.name)}`,
    summarize: (item, detail) => ({
      nodeCount: detail?.nodes?.length ?? item.nodeCount ?? 0,
      edgeCount: detail?.edges?.length ?? 0,
    }),
  },
  {
    key: 'apitester', label: 'APITester', path: '/api/history', idField: 'id', labelField: 'label', linkParam: 'history',
    kind: 'request',
    summarize: (item) => ({ method: item.method, url: item.url, label: item.label || '' }),
  },
  {
    key: 'gdd', label: 'GDD Épicerie Tycoon', path: '/api/document', idField: 'id', labelField: 'name', linkParam: 'doc',
    kind: 'document',
    // pas de résumé compact utile pour un document — la page wiki lui réserve
    // un panneau à part (iframe pleine page) plutôt qu'une carte de stats
    summarize: () => ({}),
  },
];

function ping(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1000 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function waitUntilReady(port, attempts = 20) {
  for (let i = 0; i < attempts; i++) {
    if (await ping(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

// ---------- Projets du hub : regroupent plusieurs outils autour d'un même
// projet réel (ex. une base DataSite + un site SiteBuilder + un suivi
// PlanBoard), avec un lien direct par ressource dans chaque outil ----------

function loadHubProjects() {
  if (!fs.existsSync(HUB_PROJECTS_DB)) return {};
  return JSON.parse(fs.readFileSync(HUB_PROJECTS_DB, 'utf-8'));
}

function saveHubProjects(projects) {
  fs.mkdirSync(path.dirname(HUB_PROJECTS_DB), { recursive: true });
  // écrit dans un fichier temporaire puis renomme — renommage atomique, donc
  // le fichier final contient toujours soit l'ancien contenu complet soit le
  // nouveau, jamais un état à moitié écrit
  const tmpPath = `${HUB_PROJECTS_DB}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(projects, null, 2));
  fs.renameSync(tmpPath, HUB_PROJECTS_DB);
}

function makeHubProjectId() {
  return `hp${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

const VALID_TOOL_KEYS = new Set(TOOLS.map((t) => t.key));

function isValidLinks(links) {
  return Array.isArray(links) && links.every((l) =>
    l && typeof l === 'object'
    && VALID_TOOL_KEYS.has(l.tool)
    && typeof l.resourceId === 'string' && l.resourceId.length > 0
    && typeof l.label === 'string');
}

// démarre un outil, sauf s'il répond déjà (lancé à la main, ou orphelin d'un
// hub précédent) — dans ce cas on le réutilise plutôt que de planter sur un
// port déjà occupé
function toolManager({ key, port, dir }) {
  let child = null;

  async function ensureRunning() {
    if (await ping(port)) {
      console.log(`[${key}] déjà en ligne sur ${port}, réutilisation.`);
      return;
    }
    console.log(`[${key}] démarrage...`);
    child = spawn(process.execPath, ['backend/server.js'], { cwd: dir });
    child.stdout.on('data', (chunk) => process.stdout.write(`[${key}] ${chunk}`));
    child.stderr.on('data', (chunk) => process.stderr.write(`[${key}] ${chunk}`));
    child.on('exit', (code) => {
      console.log(`[${key}] arrêté (code ${code})`);
      child = null;
    });

    if (await waitUntilReady(port)) {
      console.log(`[${key}] prêt.`);
    } else {
      console.error(`[${key}] ne répond pas — /${key} échouera tant que ce n'est pas résolu.`);
    }
  }

  function stop() {
    if (child) child.kill();
  }

  return { ensureRunning, stop };
}

const app = express();
const tools = TOOLS.map((t) => ({ ...t, manager: toolManager(t) }));
const toolKeys = new Set(TOOLS.map((t) => t.key));

// redirige /<key> (sans slash final) vers /<key>/ avant le proxy : sinon les
// chemins relatifs de la page (style.css, script.js) se résolvent contre la
// racine du hub et chargent le CSS/JS du hub dans la page de l'outil
app.use((req, res, next) => {
  if (toolKeys.has(req.path.slice(1))) return res.redirect(302, `${req.path}/`);
  next();
});

// état en direct de chaque outil, pour un indicateur visuel côté page —
// simple ping, sans effet de bord sur les outils déjà lancés
app.get('/api/status', async (req, res) => {
  const results = await Promise.all(TOOLS.map(async (t) => [t.key, await ping(t.port)]));
  res.json(Object.fromEntries(results));
});

// config partagée des 9 outils, dérivée de SEARCH_RESOURCES — le frontend
// construit son HUB_TOOLS à partir de cette réponse au lieu de retaper la
// même liste à la main (les deux dérivaient auparavant de la même donnée,
// mais séparément, avec le risque qu'elles finissent par diverger). Seuls
// les champs sérialisables sont exposés : kind/detailPath/summarize sont
// des fonctions, propres à la page wiki, jamais envoyées au client.
app.get('/api/tool-config', (req, res) => {
  res.json(SEARCH_RESOURCES.map(({ key, label, path, idField, labelField, linkParam }) => (
    { key, label, path, idField, labelField, linkParam }
  )));
});

// recherche globale : interroge chaque outil pour son propre nom/libellé
// (pas de recherche dans le contenu de chaque ressource pour cette première
// passe) — un outil injoignable ne bloque pas les autres, ses résultats sont
// simplement absents
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim().toLowerCase();
  if (!q) return res.json([]);

  const groups = await Promise.all(SEARCH_RESOURCES.map(async (r) => {
    const toolDef = TOOLS.find((t) => t.key === r.key);
    try {
      const apiRes = await fetch(`http://127.0.0.1:${toolDef.port}${r.path}`);
      if (!apiRes.ok) return { tool: r.key, label: r.label, items: [] };
      const list = await apiRes.json();
      const items = list
        .filter((item) => String(item[r.labelField]).toLowerCase().includes(q))
        .map((item) => ({
          id: String(item[r.idField]),
          label: String(item[r.labelField]),
          href: `/${r.key}/?${r.linkParam}=${encodeURIComponent(String(item[r.idField]))}`,
        }));
      return { tool: r.key, label: r.label, items };
    } catch {
      return { tool: r.key, label: r.label, items: [] };
    }
  }));

  res.json(groups.filter((g) => g.items.length > 0));
});

// express.json() scopé à ce seul préfixe plutôt que global : appliqué à
// l'app entière, il consommerait aussi le corps des requêtes proxifiées vers
// les 3 outils avant que http-proxy-middleware ne les relaie, cassant le
// transfert du body sur leurs propres routes POST/PUT
app.use('/api/hub-projects', express.json({ limit: '1mb' }));

app.get('/api/hub-projects', (req, res) => {
  res.json(Object.values(loadHubProjects()));
});

// crée un nouveau projet — refuse si le nom existe déjà (contrairement au PUT
// ci-dessous, qui fait un upsert) ; le serveur tranche l'unicité plutôt que
// le client, qui ne peut pas garantir l'absence de création concurrente
app.post('/api/hub-projects/:name', (req, res) => {
  const { description, links } = req.body;
  if (description !== undefined && typeof description !== 'string') {
    return res.status(400).json({ error: 'description doit être une chaîne.' });
  }
  if (!isValidLinks(links)) return res.status(400).json({ error: 'links doit être un tableau de liens valides.' });

  const projects = loadHubProjects();
  if (projects[req.params.name]) return res.status(409).json({ error: 'Un projet porte déjà ce nom.' });

  projects[req.params.name] = {
    name: req.params.name,
    id: makeHubProjectId(),
    description: description || '',
    links,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveHubProjects(projects);
  res.status(201).json({ ok: true, project: projects[req.params.name] });
});

app.put('/api/hub-projects/:name', (req, res) => {
  const { description, links } = req.body;
  if (description !== undefined && typeof description !== 'string') {
    return res.status(400).json({ error: 'description doit être une chaîne.' });
  }
  if (!isValidLinks(links)) return res.status(400).json({ error: 'links doit être un tableau de liens valides.' });

  const projects = loadHubProjects();
  const existing = projects[req.params.name];
  if (!existing) return res.status(404).json({ error: 'Projet introuvable.' });

  projects[req.params.name] = {
    ...existing,
    description: description || '',
    links,
    updatedAt: new Date().toISOString(),
  };
  saveHubProjects(projects);
  res.json({ ok: true, project: projects[req.params.name] });
});

app.delete('/api/hub-projects/:name', (req, res) => {
  const projects = loadHubProjects();
  delete projects[req.params.name];
  saveHubProjects(projects);
  res.json({ ok: true });
});

// page-résumé en lecture seule d'un projet-hub : un aperçu structuré de
// chaque ressource liée, calculé côté serveur pour ne jamais exposer plus
// que ce que définit SEARCH_RESOURCES[].summarize (en particulier : envkeeper
// n'a pas de detailPath, donc jamais de secret en clair ici)
app.get('/api/hub-projects/:name/wiki', async (req, res) => {
  const projects = loadHubProjects();
  const project = projects[req.params.name];
  if (!project) return res.status(404).json({ error: 'Projet introuvable.' });

  const sections = await Promise.all(project.links.map(async (link) => {
    const resourceDef = SEARCH_RESOURCES.find((r) => r.key === link.tool);
    const toolDef = TOOLS.find((t) => t.key === link.tool);
    const base = { tool: link.tool, label: resourceDef ? resourceDef.label : link.tool, resourceId: link.resourceId, linkLabel: link.label, kind: resourceDef ? resourceDef.kind : 'unknown' };
    if (!resourceDef || !toolDef) return { ...base, unreachable: true };

    try {
      const listRes = await fetch(`http://127.0.0.1:${toolDef.port}${resourceDef.path}`);
      if (!listRes.ok) return { ...base, unreachable: true };
      const list = await listRes.json();
      const item = list.find((it) => String(it[resourceDef.idField]) === link.resourceId);
      if (!item) return { ...base, missing: true };

      let detail;
      if (resourceDef.detailPath) {
        try {
          const detailRes = await fetch(`http://127.0.0.1:${toolDef.port}${resourceDef.detailPath(item)}`);
          // supprimée entre le GET liste et le GET détail
          if (!detailRes.ok) return { ...base, missing: true };
          detail = await detailRes.json();
        } catch {
          return { ...base, unreachable: true };
        }
      }

      return { ...base, ...resourceDef.summarize(item, detail) };
    } catch {
      return { ...base, unreachable: true };
    }
  }));

  res.json({
    name: project.name,
    description: project.description || '',
    updatedAt: project.updatedAt,
    sections,
  });
});

for (const { key, port, cookiePathRewrite } of tools) {
  app.use(`/${key}`, createProxyMiddleware({
    target: `http://127.0.0.1:${port}`,
    changeOrigin: true,
    pathRewrite: { [`^/${key}`]: '' },
    ...(cookiePathRewrite ? { cookiePathRewrite } : {}),
    on: {
      error: (err, req, res) => {
        console.error(`[${key}] erreur proxy :`, err.message);
        if (!res.headersSent) {
          res.status(502).send(`${key} démarre encore (ou a planté) — réessaie dans un instant.`);
        }
      },
    },
  }));
}

// no-cache plutôt que la valeur par défaut d'express.static (qui laisse le
// navigateur réutiliser une vieille version sans revalider) — ce hub change
// souvent pendant qu'on le regarde, mieux vaut resservir à chaque requête
// que de devoir deviner s'il faut vider le cache pour voir un changement
app.use(express.static(FRONTEND_DIR, {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));

function shutdown() {
  console.log('\nArrêt du hub...');
  tools.forEach((t) => t.manager.stop());
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

app.listen(PORT, async () => {
  console.log(`Hub lancé sur http://localhost:${PORT}`);
  for (const t of tools) await t.manager.ensureRunning();
});
