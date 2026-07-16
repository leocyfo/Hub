// force un rechargement complet si la page est restaurée depuis le cache
// arrière du navigateur (bfcache) — sans ça, un retour en arrière depuis un
// autre outil peut réafficher un état JS/DOM figé au moment du départ,
// potentiellement très en retard sur ce que le serveur sert réellement
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload();
});

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------- Thème clair/sombre ----------
// l'attribut data-theme (posé ici et par le script inline dans <head>, qui
// évite le flash au chargement) prime sur prefers-color-scheme dans les deux
// sens ; sans préférence explicite enregistrée, le thème suit le système
const THEME_STORAGE_KEY = 'hub-theme';

function effectiveTheme() {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit === 'dark' || explicit === 'light') return explicit;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function updateThemeToggleButton() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  const isDark = effectiveTheme() === 'dark';
  btn.textContent = isDark ? '☀' : '🌙';
  btn.setAttribute('aria-label', isDark ? 'Passer en mode clair' : 'Passer en mode sombre');
}

function toggleTheme() {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(THEME_STORAGE_KEY, next);
  updateThemeToggleButton();
}

document.getElementById('themeToggleBtn').addEventListener('click', toggleTheme);
updateThemeToggleButton();

// ---------- Défilement en fondu ----------
// appliqué seulement aux sections (.hub-intro, .hub-panel) qui ne sont
// jamais recréées après le premier rendu — surtout PAS aux cartes des
// grilles à l'intérieur, qui sont regénérées toutes les 20s par
// refreshToolStatus() : y attacher cette animation la rejouerait en boucle
if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });
  document.querySelectorAll('.hub-reveal').forEach((el) => revealObserver.observe(el));
} else {
  document.querySelectorAll('.hub-reveal').forEach((el) => el.classList.add('is-visible'));
}

// classe de couleur de la pastille de statut, déduite du texte libre du champ
// "status" (pas d'enum dédié dans projects.js, donc match par mot-clé)
function statusClass(status) {
  const s = status.toLowerCase();
  if (s.includes('fonctionnel')) return 'status-ok';
  if (s.includes('développement')) return 'status-info';
  if (s.includes('expérimentation')) return 'status-purple';
  if (s.includes('ébauche')) return 'status-dim';
  return 'status-accent';
}

// couleur de vignette choisie de façon déterministe à partir du nom (même
// projet = même couleur à chaque rendu), piochée dans --swatch-1..8
const SWATCH_COUNT = 8;
function swatchColor(name) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `var(--swatch-${(hash % SWATCH_COUNT) + 1})`;
}

function renderTechBadges(tech) {
  return tech.map((t) => `<span class="tech-badge">${escapeHtml(t)}</span>`).join('');
}

// jamais de lien inventé : "Code" ne s'affiche en lien que si repoUrl est
// renseigné, sinon simple texte non cliquable
function renderCodeLink(project) {
  return project.repoUrl
    ? `<a class="project-link" href="${escapeHtml(project.repoUrl)}" target="_blank" rel="noopener">↗ Code</a>`
    : `<span class="project-link-disabled">Code non publié</span>`;
}

function renderOpenLink(project) {
  return project.hostedPath
    ? `<a class="project-link" href="${escapeHtml(encodeURI(project.hostedPath))}">▶ Ouvrir</a>`
    : project.localUrl
      ? `<a class="project-link" href="${escapeHtml(project.localUrl)}" target="_blank" rel="noopener">▶ ${escapeHtml(project.localUrl.replace(/^https?:\/\//, ''))}</a>`
      : '';
}

// ---------- Indicateur d'état en direct ----------

// clé d'outil (même valeur que TOOLS[].key côté serveur), dérivée de
// hostedPath plutôt que dupliquée dans projects.js
function hostedKey(project) {
  return project.hostedPath ? project.hostedPath.replace(/^\/|\/$/g, '') : null;
}

let toolStatus = {};

function renderStatusDot(project) {
  const key = hostedKey(project);
  if (!key) return '';
  const state = toolStatus[key];
  const cls = state === true ? 'status-dot-up' : state === false ? 'status-dot-down' : 'status-dot-unknown';
  const label = state === true ? 'En ligne' : state === false ? 'Hors ligne' : 'Vérification…';
  return `<span class="status-dot ${cls}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"></span>`;
}

async function refreshToolStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) return;
    toolStatus = await res.json();
    renderGrid(PROJECTS, PROJECTS.length < GHOST_THRESHOLD);
  } catch {
    // hub ou réseau indisponible : on garde le dernier état connu affiché
  }
}

function renderProjectCard(project) {
  const initial = project.name.trim().charAt(0).toUpperCase();
  return `
    <article class="project-card" data-project="${escapeHtml(project.name)}" tabindex="0" role="button">
      <div class="project-card-thumb" style="--swatch-bg:${swatchColor(project.name)}"><span class="project-card-initial">${escapeHtml(initial)}</span></div>
      <div class="project-card-top">
        <h3 class="project-card-name">${escapeHtml(project.name)}</h3>
        ${renderStatusDot(project)}
        <span class="status-pill ${statusClass(project.status)}">${escapeHtml(project.status)}</span>
      </div>
      <p class="project-card-tagline">${escapeHtml(project.tagline)}</p>
      <div class="project-card-tech">${renderTechBadges(project.tech)}</div>
      ${project.localCommand ? `<code class="project-card-cmd" title="Cliquer pour copier">${escapeHtml(project.localCommand)}</code>` : ''}
      <div class="project-card-links">${renderCodeLink(project)}${renderOpenLink(project)}</div>
    </article>
  `;
}

// ---------- Grille des outils ----------

const GHOST_THRESHOLD = 4;
const GHOST_CARD_HTML = `
  <div class="project-card-ghost">
    <span class="project-card-ghost-icon">+</span>
    D'autres projets arrivent bientôt
  </div>
`;

function renderGrid(list, showGhost) {
  const cardsHtml = list.map(renderProjectCard).join('');
  document.getElementById('projectGrid').innerHTML = showGhost ? cardsHtml + GHOST_CARD_HTML : cardsHtml;
}

// ---------- Bandeau défilant ----------
// purement décoratif (aria-hidden, non cliquable) — rendu UNE SEULE FOIS au
// chargement, jamais depuis refreshToolStatus() : reconstruire ce DOM
// toutes les 20s couperait l'animation CSS en boucle et la ferait
// bégayer visiblement à chaque rafraîchissement du statut
function renderMarqueeItem(project) {
  const initial = project.name.trim().charAt(0).toUpperCase();
  return `
    <div class="hub-marquee-item">
      <span class="hub-marquee-item-thumb" style="--swatch-bg:${swatchColor(project.name)}">${escapeHtml(initial)}</span>
      <span class="hub-marquee-item-name">${escapeHtml(project.name)}</span>
    </div>
  `;
}

function renderMarquee(list) {
  // le texte est dupliqué une fois pour boucler sans coupure visible :
  // l'animation glisse de 0 à -50%, pile la largeur d'une copie
  const itemsHtml = list.map(renderMarqueeItem).join('');
  document.getElementById('hubMarqueeTrack').innerHTML = itemsHtml + itemsHtml;
}

renderGrid(PROJECTS, PROJECTS.length < GHOST_THRESHOLD);
renderMarquee(PROJECTS);
document.getElementById('hubYear').textContent = new Date().getFullYear();

const hostedCount = PROJECTS.filter((p) => p.hostedPath).length;
const techCount = new Set(PROJECTS.flatMap((p) => p.tech)).size;
document.getElementById('hubStats').innerHTML = `
  <span class="hub-stat"><strong>${PROJECTS.length}</strong> projets</span>
  <span class="hub-stat"><strong>${hostedCount}</strong> hébergés ici</span>
  <span class="hub-stat"><strong>${techCount}</strong> technologies</span>
`;

document.getElementById('contactLinks').innerHTML = CONTACT_LINKS
  .map((l) => `<a class="project-link" href="${escapeHtml(l.url)}"${l.url.startsWith('mailto:') ? '' : ' target="_blank" rel="noopener"'}>${escapeHtml(l.label)}</a>`)
  .join('');

// ---------- Modale de détail projet ----------

function openProjectModal(project) {
  document.getElementById('projectModalName').textContent = project.name;
  document.getElementById('projectModalTagline').textContent = project.tagline;
  document.getElementById('projectModalDesc').textContent = project.longDescription || project.description;
  document.getElementById('projectModalStatus').textContent = project.status;
  document.getElementById('projectModalStatus').className = `status-pill ${statusClass(project.status)}`;
  document.getElementById('projectModalInitial').textContent = project.name.trim().charAt(0).toUpperCase();
  document.getElementById('projectModalThumb').style.setProperty('--swatch-bg', swatchColor(project.name));
  document.getElementById('projectModalTech').innerHTML = renderTechBadges(project.tech);

  const cmdEl = document.getElementById('projectModalCmd');
  cmdEl.textContent = project.localCommand || '';
  cmdEl.style.display = project.localCommand ? 'block' : 'none';

  document.getElementById('projectModalLinks').innerHTML = renderCodeLink(project) + renderOpenLink(project);

  const screenshots = project.screenshots || [];
  document.getElementById('projectModalScreenshots').innerHTML = screenshots
    .map((src) => `<img src="${escapeHtml(src)}" alt="Capture d'écran de ${escapeHtml(project.name)}" loading="lazy">`)
    .join('');

  const changelog = project.changelog || [];
  document.getElementById('projectModalChangelog').innerHTML = changelog.length
    ? `<h4>Historique</h4><ul class="changelog-list">${changelog
        .map((e) => `<li><span class="changelog-date">${escapeHtml(e.date)}</span>${escapeHtml(e.text)}</li>`)
        .join('')}</ul>`
    : '';

  document.getElementById('projectModalOverlay').classList.add('open');
}

function closeProjectModal() {
  document.getElementById('projectModalOverlay').classList.remove('open');
}

document.getElementById('projectGrid').addEventListener('click', (e) => {
  if (e.target.closest('.project-link, .project-link-disabled')) return;
  if (e.target.closest('.project-card-cmd')) return;
  const card = e.target.closest('.project-card');
  if (!card) return;
  const project = PROJECTS.find((p) => p.name === card.dataset.project);
  if (project) openProjectModal(project);
});

document.getElementById('projectGrid').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (e.target.closest('.project-link, .project-link-disabled')) return;
  const card = e.target.closest('.project-card');
  if (!card) return;
  e.preventDefault();
  const project = PROJECTS.find((p) => p.name === card.dataset.project);
  if (project) openProjectModal(project);
});

document.getElementById('projectModalClose').addEventListener('click', closeProjectModal);

document.getElementById('projectModalOverlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('projectModalOverlay')) closeProjectModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('projectModalOverlay').classList.contains('open')) closeProjectModal();
});

refreshToolStatus();
setInterval(refreshToolStatus, 20000);

// ---------- Copier la commande locale ----------

document.addEventListener('click', (e) => {
  const cmdEl = e.target.closest('.project-card-cmd');
  if (!cmdEl || !cmdEl.textContent || !navigator.clipboard) return;
  const original = cmdEl.textContent;
  navigator.clipboard.writeText(original).then(() => {
    cmdEl.textContent = 'Copié !';
    cmdEl.classList.add('project-card-cmd-copied');
    setTimeout(() => {
      cmdEl.textContent = original;
      cmdEl.classList.remove('project-card-cmd-copied');
    }, 1200);
  }).catch(() => {});
});

// ---------- Recherche globale ----------

const hubSearchInputEl = document.getElementById('hubSearchInput');
const hubSearchResultsEl = document.getElementById('hubSearchResults');
let hubSearchDebounceTimer = null;
let hubSearchRequestId = 0;

function renderHubSearchResults(groups) {
  if (groups.length === 0) {
    hubSearchResultsEl.innerHTML = '<p class="hub-search-empty">Aucun résultat.</p>';
    return;
  }
  hubSearchResultsEl.innerHTML = groups.map((g) => `
    <div class="hub-search-group">
      <div class="hub-search-group-label">${escapeHtml(g.label)}</div>
      ${g.items.map((item) => `<button type="button" class="hub-search-item" data-href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</button>`).join('')}
    </div>
  `).join('');
}

async function runHubSearch(q) {
  // évite qu'une réponse lente et périmée n'écrase l'affichage d'une
  // recherche plus récente déjà revenue avant elle
  const requestId = ++hubSearchRequestId;
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  if (requestId !== hubSearchRequestId) return;
  const groups = res.ok ? await res.json() : [];
  if (requestId !== hubSearchRequestId) return;
  renderHubSearchResults(groups);
  hubSearchResultsEl.hidden = false;
}

hubSearchInputEl.addEventListener('input', () => {
  clearTimeout(hubSearchDebounceTimer);
  const q = hubSearchInputEl.value.trim();
  if (!q) {
    hubSearchRequestId++; // annule toute réponse en vol pour la recherche précédente
    hubSearchResultsEl.hidden = true;
    hubSearchResultsEl.innerHTML = '';
    return;
  }
  hubSearchDebounceTimer = setTimeout(() => runHubSearch(q), 200);
});

hubSearchInputEl.addEventListener('focus', () => {
  if (hubSearchResultsEl.innerHTML) hubSearchResultsEl.hidden = false;
});

hubSearchResultsEl.addEventListener('click', (e) => {
  const item = e.target.closest('.hub-search-item');
  if (!item) return;
  location.href = item.dataset.href;
});

document.addEventListener('click', (e) => {
  if (!document.getElementById('hubSearch').contains(e.target)) hubSearchResultsEl.hidden = true;
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !hubSearchResultsEl.hidden) {
    hubSearchResultsEl.hidden = true;
    hubSearchInputEl.blur();
  }
});

// ---------- Projets du hub : regroupent plusieurs outils autour d'un même
// projet réel, avec un lien direct vers la ressource précise dans chaque
// outil (le hub proxifie déjà /datasite, /sitebuilder, /planboard, donc ces
// fetch passent par la même origine, pas de souci CORS) ----------

// construite au démarrage à partir de GET /api/tool-config (dérivé côté
// serveur de SEARCH_RESOURCES) plutôt que retapée en dur ici — évite d'avoir
// deux listes des 9 outils maintenues séparément à la main. resourceEndpoint
// se déduit de key+path, exactement comme le fait le backend en interne.
let hubTools = [];
const toolConfigReady = (async () => {
  try {
    const res = await fetch('/api/tool-config');
    const config = res.ok ? await res.json() : [];
    hubTools = config.map((t) => ({ ...t, resourceEndpoint: `/${t.key}${t.path}` }));
  } catch {
    hubTools = [];
  }
})();

// chaque outil n'utilise pas le même nom de paramètre d'URL pour son lien
// direct (voir hubTools[].linkParam et les modifications apportées à
// chaque frontend respectif : ?db= pour DataSite, ?project= pour
// SiteBuilder/PlanBoard, ?vault= pour EnvKeeper)
function hubProjectLinkHref(link) {
  const toolDef = hubTools.find((t) => t.key === link.tool);
  const param = toolDef ? toolDef.linkParam : 'id';
  return `/${link.tool}/?${param}=${encodeURIComponent(link.resourceId)}`;
}

let hubProjects = [];
let hubToolResources = {};
let editingHubProjectName = null;

async function loadHubProjects() {
  const res = await fetch('/api/hub-projects');
  hubProjects = await res.json();
  renderHubProjectGrid();
}

function renderHubProjectCard(project) {
  const count = project.links.length;
  return `
    <article class="hub-project-card" data-hub-project="${escapeHtml(project.name)}" tabindex="0" role="button">
      <div class="hub-project-card-top">
        <h3 class="hub-project-name">${escapeHtml(project.name)}</h3>
        <button type="button" class="hub-project-edit-btn" title="Modifier" aria-label="Modifier ce projet">✏</button>
      </div>
      ${project.description ? `<p class="hub-project-desc">${escapeHtml(project.description)}</p>` : ''}
      <p class="hub-project-tool-count">${count} outil${count === 1 ? '' : 's'} lié${count === 1 ? '' : 's'}</p>
    </article>
  `;
}

function renderHubProjectGrid() {
  document.getElementById('hubProjectGrid').innerHTML = hubProjects.map(renderHubProjectCard).join('');
  document.getElementById('hubProjectGridEmpty').style.display = hubProjects.length ? 'none' : 'block';
}

// interroge les 3 outils pour peupler les sélecteurs de ressource — un outil
// injoignable ne bloque pas les autres, sa liste reste juste vide
async function loadHubToolResources() {
  await toolConfigReady;
  const entries = await Promise.all(hubTools.map(async (t) => {
    try {
      const res = await fetch(t.resourceEndpoint);
      if (!res.ok) return [t.key, []];
      const list = await res.json();
      return [t.key, list.map((item) => ({ id: String(item[t.idField]), label: String(item[t.labelField]) }))];
    } catch {
      return [t.key, []];
    }
  }));
  hubToolResources = Object.fromEntries(entries);
}

function renderHubProjectToolLinks(existingLinks) {
  const existingByTool = Object.fromEntries((existingLinks || []).map((l) => [l.tool, l.resourceId]));
  return hubTools.map((t) => {
    const resources = hubToolResources[t.key] || [];
    const options = ['<option value="">— aucun —</option>']
      .concat(resources.map((r) => `<option value="${escapeHtml(r.id)}"${existingByTool[t.key] === r.id ? ' selected' : ''}>${escapeHtml(r.label)}</option>`))
      .join('');
    return `
      <div class="hub-form-tool-link">
        <label for="hubProjectLink_${t.key}">${escapeHtml(t.label)}</label>
        <select id="hubProjectLink_${t.key}" data-tool="${t.key}" class="hub-filter-select">${options}</select>
      </div>
    `;
  }).join('');
}

async function openHubProjectModal(project) {
  editingHubProjectName = project ? project.name : null;
  document.getElementById('hubProjectModalTitle').textContent = project ? 'Modifier le projet' : 'Nouveau projet';
  document.getElementById('hubProjectNameInput').value = project ? project.name : '';
  // renommer un hub-project n'est pas géré (la clé de stockage est le nom) —
  // simple pour l'instant, cohérent avec la portée réduite de cette fonctionnalité
  document.getElementById('hubProjectNameInput').disabled = !!project;
  document.getElementById('hubProjectDescInput').value = project ? project.description : '';
  document.getElementById('hubProjectDeleteBtn').hidden = !project;
  document.getElementById('hubProjectToolLinks').innerHTML = '<p class="placeholder-text">Chargement des outils…</p>';
  document.getElementById('hubProjectModalOverlay').classList.add('open');

  await loadHubToolResources();
  document.getElementById('hubProjectToolLinks').innerHTML = renderHubProjectToolLinks(project ? project.links : []);
}

function closeHubProjectModal() {
  document.getElementById('hubProjectModalOverlay').classList.remove('open');
}

// ---------- Vue détail (sidebar + aperçu en direct de chaque outil lié) ----------
//
// Plutôt que de reconstruire un résumé de chaque outil dans le hub (9 rendus
// différents à maintenir en double), l'onglet sélectionné dans la sidebar
// charge directement la vraie page de l'outil dans une iframe, à l'URL de
// lien direct déjà calculée par hubProjectLinkHref() — même origine que le
// hub (tout est proxifié sous le même host:port), donc aucun souci de
// restriction de cadrage/CORS.

let hpdActiveIndex = 0;

function renderHpdSidebar(project, brokenIndices) {
  return project.links.map((l, i) => {
    const toolDef = hubTools.find((t) => t.key === l.tool);
    const toolLabel = toolDef ? toolDef.label : l.tool;
    const isBroken = !!(brokenIndices && brokenIndices.has(i));
    const brokenTitle = isBroken ? `title="Ressource introuvable — a peut-être été renommée ou supprimée dans ${escapeHtml(toolLabel)}"` : '';
    return `
      <button type="button" class="hpd-sidebar-item${i === hpdActiveIndex ? ' active' : ''}${isBroken ? ' broken' : ''}" data-href="${escapeHtml(hubProjectLinkHref(l))}" ${brokenTitle}>
        <span class="hpd-sidebar-tool">${escapeHtml(toolLabel)}${isBroken ? ' ⚠' : ''}</span>
        <span class="hpd-sidebar-label">${escapeHtml(l.label)}</span>
      </button>
    `;
  }).join('');
}

// vérifie que chaque ressource liée existe toujours dans son outil
// d'origine — un lien peut devenir obsolète silencieusement si la
// ressource a été renommée ou supprimée depuis l'outil lui-même (le hub ne
// le sait pas tant qu'il ne revérifie pas). Un outil injoignable n'est
// JAMAIS traité comme un lien cassé : on ne peut pas savoir, donc on
// s'abstient plutôt que d'accuser à tort.
async function validateHubProjectLinks(links) {
  await toolConfigReady;
  const toolKeys = [...new Set(links.map((l) => l.tool))];
  const idsByTool = {};
  await Promise.all(toolKeys.map(async (toolKey) => {
    const toolDef = hubTools.find((t) => t.key === toolKey);
    if (!toolDef) { idsByTool[toolKey] = null; return; }
    try {
      const res = await fetch(toolDef.resourceEndpoint);
      if (!res.ok) { idsByTool[toolKey] = null; return; }
      const list = await res.json();
      idsByTool[toolKey] = new Set(list.map((item) => String(item[toolDef.idField])));
    } catch {
      idsByTool[toolKey] = null;
    }
  }));

  const broken = new Set();
  links.forEach((l, i) => {
    const ids = idsByTool[l.tool];
    if (ids === null) return; // outil injoignable, on ignore ce lien pour cette passe
    if (!ids.has(l.resourceId)) broken.add(i);
  });
  return broken;
}

async function openHubProjectDetail(project) {
  await toolConfigReady;
  document.getElementById('hpdName').textContent = project.name;
  document.getElementById('hpdWikiLink').href = `project-wiki.html?project=${encodeURIComponent(project.name)}`;
  const descEl = document.getElementById('hpdDesc');
  descEl.textContent = project.description || '';
  descEl.style.display = project.description ? 'block' : 'none';

  const sidebarEl = document.getElementById('hpdSidebar');
  const iframeEl = document.getElementById('hpdIframe');
  const emptyEl = document.getElementById('hpdEmpty');
  hpdActiveIndex = 0;

  if (project.links.length === 0) {
    sidebarEl.innerHTML = '';
    iframeEl.style.display = 'none';
    iframeEl.src = 'about:blank';
    emptyEl.style.display = 'block';
  } else {
    emptyEl.style.display = 'none';
    iframeEl.style.display = 'block';
    sidebarEl.innerHTML = renderHpdSidebar(project, null);
    iframeEl.src = hubProjectLinkHref(project.links[0]);

    // validation asynchrone, appliquée après coup — ne bloque jamais
    // l'ouverture de la vue détail ; ignorée si l'utilisateur a depuis
    // fermé cette vue ou ouvert un autre projet
    validateHubProjectLinks(project.links).then((brokenIndices) => {
      if (!document.getElementById('hubProjectDetailOverlay').classList.contains('open')) return;
      if (document.getElementById('hpdName').textContent !== project.name) return;
      sidebarEl.innerHTML = renderHpdSidebar(project, brokenIndices);
    });
  }

  document.getElementById('hubProjectDetailOverlay').classList.add('open');
}

function closeHubProjectDetail() {
  document.getElementById('hubProjectDetailOverlay').classList.remove('open');
  // libère la page chargée dans l'iframe plutôt que de la laisser tourner
  // (timers, connexions...) en arrière-plan une fois la modale fermée
  document.getElementById('hpdIframe').src = 'about:blank';
}

document.getElementById('hpdSidebar').addEventListener('click', (e) => {
  const btn = e.target.closest('.hpd-sidebar-item');
  if (!btn) return;
  const items = [...document.querySelectorAll('.hpd-sidebar-item')];
  hpdActiveIndex = items.indexOf(btn); // préservé si la sidebar se re-rend après validation
  items.forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('hpdIframe').src = btn.dataset.href;
});

document.getElementById('hubProjectDetailClose').addEventListener('click', closeHubProjectDetail);
document.getElementById('hubProjectDetailOverlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('hubProjectDetailOverlay')) closeHubProjectDetail();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('hubProjectDetailOverlay').classList.contains('open')) closeHubProjectDetail();
});

// clic sur la carte = vue détail (sidebar + aperçu en direct) ; clic sur le
// crayon = édition — les deux sont dans le même élément carte, donc le
// bouton doit être exclu explicitement avant de retomber sur le comportement
// par défaut (comme .hub-project-link l'était avant sur ces mêmes cartes)
document.getElementById('hubProjectGrid').addEventListener('click', (e) => {
  const card = e.target.closest('.hub-project-card');
  if (!card) return;
  const project = hubProjects.find((p) => p.name === card.dataset.hubProject);
  if (!project) return;
  if (e.target.closest('.hub-project-edit-btn')) {
    openHubProjectModal(project);
    return;
  }
  openHubProjectDetail(project);
});

document.getElementById('hubProjectGrid').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (e.target.closest('.hub-project-edit-btn')) return;
  const card = e.target.closest('.hub-project-card');
  if (!card) return;
  e.preventDefault();
  const project = hubProjects.find((p) => p.name === card.dataset.hubProject);
  if (project) openHubProjectDetail(project);
});

document.getElementById('newHubProjectBtn').addEventListener('click', () => openHubProjectModal(null));
// même action que newHubProjectBtn, juste un second point d'entrée depuis
// le CTA secondaire de l'en-tête — pas de logique dupliquée
document.getElementById('heroNewProjectBtn').addEventListener('click', () => openHubProjectModal(null));
document.getElementById('hubProjectModalClose').addEventListener('click', closeHubProjectModal);
document.getElementById('hubProjectModalOverlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('hubProjectModalOverlay')) closeHubProjectModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('hubProjectModalOverlay').classList.contains('open')) closeHubProjectModal();
});

document.getElementById('hubProjectForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('hubProjectNameInput').value.trim();
  if (!name) return;
  const description = document.getElementById('hubProjectDescInput').value.trim();
  const links = hubTools.map((t) => {
    const select = document.getElementById(`hubProjectLink_${t.key}`);
    const resourceId = select.value;
    if (!resourceId) return null;
    const resource = (hubToolResources[t.key] || []).find((r) => r.id === resourceId);
    return { tool: t.key, resourceId, label: resource ? resource.label : resourceId };
  }).filter(Boolean);

  const method = editingHubProjectName ? 'PUT' : 'POST';
  const url = `/api/hub-projects/${encodeURIComponent(editingHubProjectName || name)}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, links }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || "Échec de l'enregistrement.");
    return;
  }
  closeHubProjectModal();
  await loadHubProjects();
});

document.getElementById('hubProjectDeleteBtn').addEventListener('click', async () => {
  if (!editingHubProjectName) return;
  if (!confirm(`Supprimer le projet « ${editingHubProjectName} » ?`)) return;
  await fetch(`/api/hub-projects/${encodeURIComponent(editingHubProjectName)}`, { method: 'DELETE' });
  closeHubProjectModal();
  await loadHubProjects();
});

// exposé pour le harnais de vérification (jsdom), qui peut ainsi attendre la
// fin du premier chargement au lieu de deviner un délai
window.__hubProjectsReady = loadHubProjects();
