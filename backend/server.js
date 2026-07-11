const express = require('express');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { createProxyMiddleware } = require('http-proxy-middleware');

const PORT = process.env.PORT || 8080;
// server.js vit dans hub/backend/ : chaque outil vit sous hub/projet/<Nom>/
const PROJET_DIR = path.join(__dirname, '..', 'projet');
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

// un outil = une clé de route (/<key>), un port local, un dossier sous
// projet/. cookiePathRewrite est spécifique à DataSite (Path=/ codé en dur
// dans son backend/auth.js) ; les autres outils n'ont pas d'auth, donc pas
// de cookie à réécrire
const TOOLS = [
  { key: 'datasite', port: 3000, dir: path.join(PROJET_DIR, 'DataSite'), cookiePathRewrite: { '/': '/datasite' } },
  { key: 'sitebuilder', port: 4000, dir: path.join(PROJET_DIR, 'SiteBuilder') },
  { key: 'planboard', port: 4500, dir: path.join(PROJET_DIR, 'PlanBoard') },
];

const app = express();

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

async function waitReady(port, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    if (await ping(port)) return true;
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

// démarre un outil en interne, sauf s'il répond déjà (lancé à la main, ou
// instance orpheline d'un précédent hub mal fermé) — dans ce cas on réutilise
// ce qui tourne plutôt que d'échouer sur un port déjà occupé
function createToolManager({ key, port, dir }) {
  let proc = null;

  async function ensureRunning() {
    const alreadyUp = await ping(port);
    if (alreadyUp) {
      console.log(`[${key}] déjà en cours d'exécution sur le port ${port}, réutilisation.`);
      return;
    }

    console.log(`[${key}] démarrage...`);
    // process.execPath (pas la chaîne 'node') pour éviter toute ambiguïté de
    // résolution de PATH ; spawn direct d'un .exe (pas un script npm/.cmd),
    // donc pas de souci d'orphelin lié à cmd.exe sous Windows
    proc = spawn(process.execPath, ['backend/server.js'], { cwd: dir });
    proc.stdout.on('data', (chunk) => process.stdout.write(`[${key}] ${chunk}`));
    proc.stderr.on('data', (chunk) => process.stderr.write(`[${key}] ${chunk}`));
    proc.on('exit', (code) => {
      console.log(`[${key}] processus terminé (code ${code})`);
      proc = null;
    });

    const ready = await waitReady(port);
    if (ready) {
      console.log(`[${key}] prêt.`);
    } else {
      console.error(`[${key}] ne répond toujours pas après plusieurs essais — /${key} échouera tant que ce n'est pas résolu.`);
    }
  }

  function kill() { if (proc) proc.kill(); }

  return { ensureRunning, kill };
}

const tools = TOOLS.map(t => ({ ...t, manager: createToolManager(t) }));

// route exacte SANS slash, pour n'importe quel outil : doit rediriger avant le
// montage des proxys. Sinon les chemins relatifs de la page de l'outil
// (style.css, script.js) se résolvent contre la racine du hub et chargent
// silencieusement le CSS/JS *du hub* dans la page de l'outil (bug réel, pas
// juste théorique). Comparaison manuelle sur req.path (pas app.get(`/${key}`,
// ...)) : le "strict routing" d'Express est désactivé par défaut, donc une
// route sans slash matche AUSSI la version avec slash — ça provoquait une
// boucle de redirection sur /<key>/ vers elle-même avant ce correctif. Un
// seul middleware pour tous les outils plutôt qu'un par outil : même
// comportement, une seule comparaison par requête au lieu d'une par outil.
const TOOL_KEYS = new Set(TOOLS.map(t => t.key));
app.use((req, res, next) => {
  if (TOOL_KEYS.has(req.path.slice(1))) return res.redirect(302, `${req.path}/`);
  next();
});

// état en direct de chaque outil, pour le petit point vert/rouge sur les
// cartes hébergées — réutilise ping() (déjà utilisé pour ensureRunning), un
// simple http.get sans effet de bord, donc rien à craindre pour les outils
// déjà lancés
app.get('/api/status', async (req, res) => {
  const entries = await Promise.all(TOOLS.map(async (t) => [t.key, await ping(t.port)]));
  res.json(Object.fromEntries(entries));
});

tools.forEach(({ key, port, cookiePathRewrite }) => {
  app.use(`/${key}`, createProxyMiddleware({
    target: `http://127.0.0.1:${port}`,
    changeOrigin: true,
    // le backend de l'outil ne voit jamais le préfixe /<key> : aucun
    // changement nécessaire dans son propre backend/ (routes, etc.)
    pathRewrite: { [`^/${key}`]: '' },
    // pas de slash final, pour matcher /<key> ET /<key>/*
    ...(cookiePathRewrite ? { cookiePathRewrite } : {}),
    on: {
      error: (err, req, res) => {
        console.error(`[${key}] erreur proxy :`, err.message);
        if (!res.headersSent) {
          res.status(502).send(`${key} démarre encore (ou a planté) — voir la console du hub, réessayer dans un instant.`);
        }
      },
    },
  }));
});

// page du hub elle-même (après les montages plus spécifiques ci-dessus)
app.use(express.static(FRONTEND_DIR));

function shutdown() {
  console.log('\nArrêt du hub...');
  tools.forEach(t => t.manager.kill());
  process.exit(0);
}

// SIGINT (Ctrl+C) est le seul signal fiable sous Windows ; SIGTERM enregistré
// quand même, sans coût, au cas où (WSL, gestionnaire de process externe...)
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

app.listen(PORT, async () => {
  console.log(`Hub lancé sur http://localhost:${PORT}`);
  for (const t of tools) await t.manager.ensureRunning();
});
