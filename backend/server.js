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

app.use(express.static(FRONTEND_DIR));

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
