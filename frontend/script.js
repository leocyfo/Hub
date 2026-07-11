function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// classe de couleur de la pastille de statut, déduite du texte libre du champ
// "status" (pas d'enum dédié dans projects.js, donc match par mot-clé)
function statusClass(status) {
  const s = status.toLowerCase();
  if (s.includes('fonctionnel')) return 'status-ok';
  if (s.includes('développement')) return 'status-info';
  if (s.includes('expérimentation')) return 'status-purple';
  if (s.includes('ébauche')) return 'status-dim';
  return 'status-accent'; // prototype, etc.
}

// libellés affichés dans le filtre de statut — mêmes clés que statusClass
const STATUS_LABELS = {
  'status-ok': 'Fonctionnel',
  'status-info': 'En développement',
  'status-purple': 'Expérimentation',
  'status-dim': 'Ébauche',
  'status-accent': 'Prototype / autre',
};

// couleur de l'icône carrée du projet : choisie de façon déterministe à
// partir du nom (même projet = même couleur à chaque rendu), piochée dans la
// palette --swatch-1..8 définie dans style.css
const SWATCH_COUNT = 8;
function swatchColor(name) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `var(--swatch-${(hash % SWATCH_COUNT) + 1})`;
}

function renderTechBadges(tech) {
  return tech.map(t => `<span class="tech-badge">${escapeHtml(t)}</span>`).join('');
}

// jamais de lien inventé : "Code" ne s'affiche en lien que si repoUrl est
// renseigné (dépôt réellement publié), sinon simple texte non cliquable —
// partagé entre la carte et la modale pour ne jamais diverger entre les deux
function renderCodeLink(project) {
  return project.repoUrl
    ? `<a class="project-link" href="${escapeHtml(project.repoUrl)}" target="_blank" rel="noopener">↗ Code</a>`
    : `<span class="project-link-disabled">Code non publié</span>`;
}

// hébergé sur ce hub : un seul lien "Ouvrir" (même onglet, navigation
// interne) — remplace localUrl plutôt que s'y ajouter, deux liens vers
// deux origines différentes casseraient la session entre l'un et l'autre
function renderOpenLink(project) {
  return project.hostedPath
    ? `<a class="project-link" href="${escapeHtml(encodeURI(project.hostedPath))}">▶ Ouvrir</a>`
    : project.localUrl
      ? `<a class="project-link" href="${escapeHtml(project.localUrl)}" target="_blank" rel="noopener">▶ ${escapeHtml(project.localUrl.replace(/^https?:\/\//, ''))}</a>`
      : '';
}

// clé d'outil (même valeur que TOOLS[].key côté serveur), dérivée de
// hostedPath plutôt que stockée en double dans projects.js — seul un projet
// hébergé sur ce hub peut avoir un état en direct
function hostedKey(project) {
  return project.hostedPath ? project.hostedPath.replace(/^\/|\/$/g, '') : null;
}

// dernier état connu de chaque outil ({ [key]: boolean }), rempli par
// refreshToolStatus() ; absent tant que la première réponse n'est pas arrivée
let toolStatus = {};

function renderStatusDot(project) {
  const key = hostedKey(project);
  if (!key) return '';
  const state = toolStatus[key];
  const cls = state === true ? 'status-dot-up' : state === false ? 'status-dot-down' : 'status-dot-unknown';
  const label = state === true ? 'En ligne' : state === false ? 'Hors ligne' : 'Vérification…';
  return `<span class="status-dot ${cls}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"></span>`;
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
      <p class="project-card-desc">${escapeHtml(project.description)}</p>
      <div class="project-card-tech">${renderTechBadges(project.tech)}</div>
      ${project.localCommand ? `<code class="project-card-cmd" title="Cliquer pour copier">${escapeHtml(project.localCommand)}</code>` : ''}
      <div class="project-card-links">${renderCodeLink(project)}${renderOpenLink(project)}</div>
    </article>
  `;
}

// ---------- Grille : rendu + recherche/filtre ----------

// en dessous de ce nombre de projets, une carte "en pointillés" comble le
// vide de la grille (mais seulement hors recherche/filtre actif, sinon elle
// se mélangerait avec de vrais résultats de recherche et prêterait à confusion)
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
  document.getElementById('projectGridEmpty').style.display = list.length ? 'none' : 'block';
}

function matchesFilters(project, filters) {
  const q = filters.query.trim().toLowerCase();
  const matchesQuery = !q
    || project.name.toLowerCase().includes(q)
    || project.tagline.toLowerCase().includes(q)
    || project.tech.some(t => t.toLowerCase().includes(q));
  const matchesStatus = filters.statusCat === 'all' || statusClass(project.status) === filters.statusCat;
  const matchesHosted = filters.hosted === 'all'
    || (filters.hosted === 'hosted' && !!project.hostedPath)
    || (filters.hosted === 'external' && !project.hostedPath);
  return matchesQuery && matchesStatus && matchesHosted;
}

function applyFilters() {
  const filters = {
    query: document.getElementById('projectSearch').value,
    statusCat: document.getElementById('statusFilter').value,
    hosted: document.getElementById('hostedFilter').value,
  };
  const filtersActive = filters.query.trim() !== '' || filters.statusCat !== 'all' || filters.hosted !== 'all';
  const showGhost = !filtersActive && PROJECTS.length < GHOST_THRESHOLD;
  renderGrid(PROJECTS.filter(p => matchesFilters(p, filters)), showGhost);
}

// options de statut générées à partir des catégories réellement présentes
// dans PROJECTS (pas de catégorie vide affichée)
const presentCategories = [...new Set(PROJECTS.map(p => statusClass(p.status)))];
document.getElementById('statusFilter').insertAdjacentHTML('beforeend',
  presentCategories.map(c => `<option value="${c}">${escapeHtml(STATUS_LABELS[c])}</option>`).join(''));

document.getElementById('projectSearch').addEventListener('input', applyFilters);
document.getElementById('statusFilter').addEventListener('change', applyFilters);
document.getElementById('hostedFilter').addEventListener('change', applyFilters);

applyFilters();
document.getElementById('hubYear').textContent = new Date().getFullYear();

// stats rapides dans le hero, dérivées de PROJECTS (jamais de la liste
// filtrée) — une seule source de vérité (projects.js), rien à tenir à jour
// à la main dans le HTML
const hostedCount = PROJECTS.filter(p => p.hostedPath).length;
const techCount = new Set(PROJECTS.flatMap(p => p.tech)).size;
document.getElementById('hubStats').innerHTML = `
  <span class="hub-stat"><strong>${PROJECTS.length}</strong> projets</span>
  <span class="hub-stat"><strong>${hostedCount}</strong> hébergés ici</span>
  <span class="hub-stat"><strong>${techCount}</strong> technologies</span>
`;

// liens de contact sous la bio À propos
document.getElementById('contactLinks').innerHTML = CONTACT_LINKS
  .map(l => `<a class="project-link" href="${escapeHtml(l.url)}"${l.url.startsWith('mailto:') ? '' : ' target="_blank" rel="noopener"'}>${escapeHtml(l.label)}</a>`)
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
    .map(src => `<img src="${escapeHtml(src)}" alt="Capture d'écran de ${escapeHtml(project.name)}" loading="lazy">`)
    .join('');

  const changelog = project.changelog || [];
  document.getElementById('projectModalChangelog').innerHTML = changelog.length
    ? `<h4>Historique</h4><ul class="changelog-list">${changelog
        .map(e => `<li><span class="changelog-date">${escapeHtml(e.date)}</span>${escapeHtml(e.text)}</li>`)
        .join('')}</ul>`
    : '';

  document.getElementById('projectModalOverlay').classList.add('open');
}

function closeProjectModal() {
  document.getElementById('projectModalOverlay').classList.remove('open');
}

// écouteurs délégués sur #projectGrid (pas sur chaque carte) : la grille est
// réécrite à chaque filtre (renderGrid), des écouteurs posés carte par carte
// seraient perdus au premier re-render
document.getElementById('projectGrid').addEventListener('click', (e) => {
  if (e.target.closest('.project-link, .project-link-disabled')) return; // laisser les liens agir normalement
  const card = e.target.closest('.project-card');
  if (!card) return;
  const project = PROJECTS.find(p => p.name === card.dataset.project);
  if (project) openProjectModal(project);
});

document.getElementById('projectGrid').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (e.target.closest('.project-link, .project-link-disabled')) return;
  const card = e.target.closest('.project-card');
  if (!card) return;
  e.preventDefault();
  const project = PROJECTS.find(p => p.name === card.dataset.project);
  if (project) openProjectModal(project);
});

document.getElementById('projectModalClose').addEventListener('click', closeProjectModal);

document.getElementById('projectModalOverlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('projectModalOverlay')) closeProjectModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('projectModalOverlay').classList.contains('open')) closeProjectModal();
});

// ---------- Indicateur d'état en direct ----------

// rendu initial sans indicateur (aucun état connu), rempli dès la première
// réponse de /api/status puis rafraîchi périodiquement — jamais de blocage du
// rendu initial de la grille en attendant le réseau
async function refreshToolStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) return;
    toolStatus = await res.json();
    applyFilters();
  } catch {
    // hub ou réseau indisponible : on garde le dernier état connu affiché
  }
}

refreshToolStatus();
setInterval(refreshToolStatus, 20000);

// ---------- Copier la commande locale ----------

// écouteur unique sur document plutôt que délégué sur #projectGrid : couvre
// aussi #projectModalCmd (même classe .project-card-cmd), qui est en dehors
// de la grille et n'est jamais recréé par renderGrid
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

// ---------- Raccourci clavier : / focalise la recherche ----------

function isTypingInField() {
  const tag = document.activeElement && document.activeElement.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !isTypingInField()) {
    e.preventDefault();
    document.getElementById('projectSearch').focus();
  }
});
