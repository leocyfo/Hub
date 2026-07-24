// force un rechargement complet si la page est restaurée depuis le cache
// arrière du navigateur (bfcache)
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload();
});

// dupliqué depuis script.js — pas de module partagé dans ce codebase, chaque
// page statique autonome porte sa propre copie
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const TOOL_ICONS = {
  datasite: '🗄️', sitebuilder: '🧱', planboard: '📋', envkeeper: '🔐',
  snippetbox: '✂️', moodboard: '🎨', themeforge: '🌈', flowmap: '🔀', apitester: '🛰️', gdd: '📄',
};

// couleur choisie à la main pour certains projets (prioritaire) — Épicerie
// Tycoon reste sur le brun/orange déjà établi pour le GDD (--couleur-accent
// dans hub/projet/GDD/frontend/style.css), pas une couleur tirée au hasard
// par le hash ci-dessous, qui pouvait tomber sur du violet ou du gris.
const COULEURS_PROJET = {
  'Épicerie Tycoon': '#e0954a',
};

// dupliqué depuis script.js (mêmes raisons qu'escapeHtml/TOOL_ICONS) : couleur
// déterministe à partir du nom du projet, piochée dans les mêmes --swatch-1..8
// que les cartes de la page d'accueil — sert de repli pour un projet sans
// couleur choisie à la main dans COULEURS_PROJET ci-dessus.
const SWATCH_COUNT = 8;
function swatchColor(name) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `var(--swatch-${(hash % SWATCH_COUNT) + 1})`;
}

function couleurProjet(name) {
  return COULEURS_PROJET[name] || swatchColor(name);
}

const params = new URLSearchParams(location.search);
const projectName = params.get('project') || '';
if (projectName) {
  document.documentElement.style.setProperty('--projet-accent', couleurProjet(projectName));
}
// ?vue=outils force la barre d'onglets (sans le GDD, déjà vu sur la page par
// défaut) même quand une ressource "document" est présente — "✏ Éditer" bascule
// entre les deux, dans un sens comme dans l'autre
const vueOutils = params.get('vue') === 'outils';

// connu tout de suite, pas besoin d'attendre le fetch pour câbler ce lien
document.getElementById('wikiEditBtn').href = vueOutils
  ? `project-wiki.html?project=${encodeURIComponent(projectName)}`
  : `project-wiki.html?project=${encodeURIComponent(projectName)}&vue=outils`;

// le GDD suit son onglet actif dans son propre hash (#flowcharts, etc. —
// voir GDD/frontend/js/app.js), lisible depuis ici (même origine). Au clic
// sur « Éditer » depuis la page GDD (vue document), on vise directement
// l'outil qui correspond à l'onglet du GDD ouvert au moment du clic plutôt
// que de retomber systématiquement sur le premier onglet de la barre — et
// inversement, en revenant du côté outils vers le GDD, on rouvre l'onglet
// du GDD qui correspond à l'outil affiché au moment du clic.
const GDD_ONGLET_VERS_OUTIL = {
  flowcharts: 'flowmap',
  database: 'datasite',
  calculateur: 'snippetbox',
  'feuille-de-route': 'planboard',
};
const OUTIL_VERS_GDD_ONGLET = Object.fromEntries(
  Object.entries(GDD_ONGLET_VERS_OUTIL).map(([onglet, outil]) => [outil, onglet])
);

if (!vueOutils) {
  document.getElementById('wikiEditBtn').addEventListener('click', () => {
    const btn = document.getElementById('wikiEditBtn');
    let outilCible = '';
    try {
      const hashGdd = (document.getElementById('wikiViewFrame').contentWindow.location.hash || '').slice(1);
      outilCible = GDD_ONGLET_VERS_OUTIL[hashGdd] || '';
    } catch (e) { /* ressource affichée n'est pas le GDD (ou pas accessible) : pas de ciblage */ }
    btn.href = `project-wiki.html?project=${encodeURIComponent(projectName)}&vue=outils${outilCible ? `&outil=${encodeURIComponent(outilCible)}` : ''}`;
  });
} else {
  document.getElementById('wikiEditBtn').addEventListener('click', () => {
    const btn = document.getElementById('wikiEditBtn');
    // sectionActiveCourante est mise à jour par activerOnglet() à chaque
    // changement d'onglet principal — reflète toujours l'outil affiché là,
    // maintenant, au moment du clic
    const outilActuel = sectionActiveCourante && sectionActiveCourante.tool;
    const ongletGdd = outilActuel ? OUTIL_VERS_GDD_ONGLET[outilActuel] : '';
    btn.href = `project-wiki.html?project=${encodeURIComponent(projectName)}${ongletGdd ? `&gddOnglet=${encodeURIComponent(ongletGdd)}` : ''}`;
  });
}

// fixe le haut de l'iframe plein écran juste sous la barre d'onglets (ou
// juste sous la barre du haut si les onglets sont masqués, cas du GDD — voir
// plus bas) — mesuré au lieu d'être deviné en dur en CSS, pour rester correct
// même si cette barre change de hauteur (ex. les onglets passent sur deux lignes)
function positionerVuePleinEcran() {
  const subtabs = document.getElementById('wikiSubTabs');
  const tabs = document.getElementById('wikiTabs');
  const topbar = document.querySelector('.wiki-topbar');
  const frame = document.getElementById('wikiViewFrame');
  if (!frame) return;
  let reference = topbar;
  if (tabs && tabs.style.display !== 'none') reference = tabs;
  if (subtabs && subtabs.style.display !== 'none') reference = subtabs;
  if (!reference) return;
  const top = Math.ceil(reference.getBoundingClientRect().bottom);
  frame.style.top = `${top}px`;
  // hauteur explicite plutôt que dérivée de top+bottom:0 — une iframe
  // position:fixed dont la hauteur n'est qu'implicite (calculée à partir de
  // deux contraintes verticales opposées) peut rester vide visuellement dans
  // Chrome headless même quand son contenu est correctement chargé et présent
  // dans le DOM (vérifié : innerHTML correct, readyState "complete", mais
  // rien à l'écran tant que la hauteur n'est pas posée explicitement ici)
  frame.style.height = `${Math.max(200, window.innerHeight - top)}px`;
}
window.addEventListener('resize', () => {
  if (document.body.classList.contains('wiki-fullscreen')) positionerVuePleinEcran();
});

// même raison de duplication que pour escapeHtml/TOOL_ICONS ci-dessus : une
// ressource "document" (le GDD) n'a qu'une page, pas de paramètre de
// sélection ; les autres utilisent le linkParam de leur outil (ex. ?project=,
// ?db=), déduit de
// /api/tool-config plutôt que retapé en dur ici
// même mécanisme que FlowMap/SnippetBox/DataSite côté outil : la page
// d'accueil/le picker/la barre latérale de l'outil filtre dessus pour
// n'afficher que les ressources de CE projet plutôt que celles de tous les
// projets confondus — voir refreshFlowList()/refreshSnippets()/loadDatabases()
function suffixeProjetRessources(resourceIds) {
  return resourceIds && resourceIds.length
    ? `projetRessources=${encodeURIComponent(resourceIds.join(','))}`
    : '';
}

function hrefDeSection(section, toolConfigByKey) {
  if (section.kind === 'document') return `/${section.tool}/`;
  if (section.kind === 'tool-root') {
    const q = suffixeProjetRessources(section.resourceIds);
    return `/${section.tool}/${q ? `?${q}` : ''}`;
  }
  if (section.kind === 'tool-group') {
    // l'onglet principal ouvre directement la première ressource du groupe
    // plutôt que la liste brute de l'outil — voir renderSubTabs() pour
    // basculer vers les autres ressources du groupe sans repasser par là ;
    // le filtre porte sur TOUT le groupe, pas juste cette première ressource
    return hrefDeSection({ ...section.resources[0], resourceIds: section.resourceIds }, toolConfigByKey);
  }
  const param = (toolConfigByKey[section.tool] || {}).linkParam || 'id';
  const q = suffixeProjetRessources(section.resourceIds || [section.resourceId]);
  return `/${section.tool}/?${param}=${encodeURIComponent(section.resourceId)}${q ? `&${q}` : ''}`;
}

// regroupe les sections d'un même outil sous un seul onglet — plusieurs
// ressources du même outil (ex. 5 diagrammes FlowMap, 2 snippets) créaient
// sinon un onglet par ressource et saturaient la barre. Un outil resté seul
// garde son onglet direct comme avant ; un outil avec plusieurs ressources
// n'a plus qu'un onglet (qui ouvre sa première ressource), plus une rangée
// de sous-onglets pour basculer vers les autres sans quitter la page — voir
// renderSubTabs(). resourceIds posé dans les deux cas : sert au filtrage
// « juste ce qui est lié au projet » côté outil, même quand il n'y a qu'une
// seule ressource liée.
function regrouperParOutil(sections) {
  const parOutil = new Map();
  sections.forEach((section) => {
    if (!parOutil.has(section.tool)) parOutil.set(section.tool, []);
    parOutil.get(section.tool).push(section);
  });
  return [...parOutil.values()].map((group) => {
    if (group.length === 1) return { ...group[0], resourceIds: [group[0].resourceId] };
    return {
      tool: group[0].tool,
      label: group[0].label,
      linkLabel: null,
      kind: 'tool-group',
      resources: group,
      resourceIds: group.map((s) => s.resourceId),
    };
  });
}

let ongletActif = 0;
let sectionsActuelles = [];
let sectionsOngletsActuelles = [];
let toolConfigByKeyActuel = {};
let sectionActiveCourante = null;

// certains outils (FlowMap pour l'instant) acceptent qu'on injecte la barre
// de sous-onglets DANS leur propre iframe, juste sous leur propre barre
// d'outils — demandé explicitement : l'ordre visuel obtenu est « barre de
// l'outil, puis sélecteur de ressource, puis canevas », sans toucher au code
// de l'outil. Un outil absent de cette liste garde l'ancien comportement
// (barre de sous-onglets côté wiki, au-dessus de l'iframe) — voir
// renderSubTabsParent() plus bas, utilisé comme repli.
const CIBLES_INJECTION = {
  flowmap: { topbar: '#workspaceView .fm-topbar', canvas: '#workspaceView .fm-canvas' },
};

// vrai si le lien pointe vers une ressource qui n'existe plus côté outil —
// le cas typique est un renommage fait directement dans l'outil (ex. « ✏
// Renommer » un diagramme FlowMap) : le lien du projet-hub garde l'ANCIEN
// nom (posé une fois pour toutes à la création du lien) et ne le retrouve
// plus. Posé par /api/hub-projects/:name/wiki côté serveur (missing/unreachable).
function lienCasse(section) {
  return !!(section && (section.missing || section.unreachable));
}

function construireItemsSousOnglets(section) {
  const voirToutHref = hrefDeSection(
    { tool: section.tool, kind: 'tool-root', resourceIds: section.resourceIds },
    toolConfigByKeyActuel
  );
  return {
    items: section.resources.map((r) => ({
      label: r.linkLabel || r.label,
      href: hrefDeSection(r, toolConfigByKeyActuel),
      casse: lienCasse(r),
    })),
    voirToutHref,
    voirToutLabel: `Tout voir dans ${section.label} ↗`,
  };
}

// repli pour un outil non listé dans CIBLES_INJECTION : barre classique côté
// wiki, au-dessus de l'iframe (comportement d'origine)
function renderSubTabsParent(section) {
  const nav = document.getElementById('wikiSubTabs');
  if (!section || section.kind !== 'tool-group') {
    nav.innerHTML = '';
    nav.style.display = 'none';
    return;
  }
  const { items, voirToutHref, voirToutLabel } = construireItemsSousOnglets(section);
  nav.innerHTML = items.map((it, i) => `
    <button type="button" class="wiki-subtab${i === 0 ? ' actif' : ''}${it.casse ? ' wiki-subtab-casse' : ''}" data-href="${escapeHtml(it.href)}" data-casse="${it.casse ? '1' : ''}" data-label="${escapeHtml(it.label)}"
            title="${it.casse ? 'Ce lien ne pointe plus vers une ressource existante — corrige-le via « ✏ Éditer »' : ''}">${it.casse ? '⚠ ' : ''}${escapeHtml(it.label)}</button>
  `).join('') + `<button type="button" class="wiki-subtab wiki-subtab-all" data-href="${escapeHtml(voirToutHref)}" title="Voir la liste complète de l'outil, dans cette même page">${escapeHtml(voirToutLabel)}</button>`;

  nav.querySelectorAll('.wiki-subtab').forEach((btn) => {
    btn.addEventListener('click', () => {
      nav.querySelectorAll('.wiki-subtab').forEach((b) => b.classList.remove('actif'));
      if (!btn.classList.contains('wiki-subtab-all')) btn.classList.add('actif');
      naviguerVersRessource(btn.dataset.href, btn.dataset.casse === '1', btn.dataset.label || btn.textContent);
    });
  });
  nav.style.display = 'flex';
}

// styles posés en ligne plutôt que via une classe : l'iframe ne charge pas
// la feuille de style de la page wiki, une classe seule y resterait nue.
// var(--projet-accent) ne se résoudrait pas non plus dans ce document-là
// (posée sur le :root de la page PARENTE, pas de celui de l'iframe) — on lit
// donc sa valeur déjà calculée côté parent et on pose une couleur en dur.
function stylerPastilleInjectee(el, active) {
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--projet-accent').trim() || '#e0954a';
  el.style.cssText = `
    display:inline-flex; align-items:center; background:${active ? accent : '#26231d'};
    border:1px solid ${active ? accent : '#423d32'}; border-radius:999px; padding:5px 12px;
    color:${active ? '#1c1a16' : '#b3ac9c'}; font-family:inherit; font-size:12px; cursor:pointer;
    text-decoration:none; font-weight:${active ? '600' : '400'};
  `;
}

// tente d'injecter la barre de sous-onglets dans l'iframe tout juste
// chargée (rappelée à chaque 'load', y compris ceux déclenchés par un clic
// sur une pastille déjà injectée — l'iframe navigue alors vers une nouvelle
// page qui n'a évidemment pas encore la barre)
function tenterInjectionSousOnglets() {
  const frame = document.getElementById('wikiViewFrame');
  const section = sectionActiveCourante;
  const cible = section && section.kind === 'tool-group' ? CIBLES_INJECTION[section.tool] : null;

  if (!cible) {
    // outil sans cible d'injection connue (ou pas un groupe) : repli
    // classique côté wiki, et on s'assure qu'un ancien reliquat injecté
    // dans une iframe précédente ne traîne pas visuellement
    renderSubTabsParent(section);
    return;
  }
  document.getElementById('wikiSubTabs').style.display = 'none';

  let doc;
  try { doc = frame.contentDocument; } catch (e) { return; } // sécurité, ne devrait pas arriver en same-origin
  if (!doc) return;
  const topbar = doc.querySelector(cible.topbar);
  const canvas = doc.querySelector(cible.canvas);
  if (!topbar) { renderSubTabsParent(section); return; } // page pas encore/plus dans l'état attendu : repli

  const ancienne = doc.getElementById('wikiSubTabsInjectees');
  if (ancienne) ancienne.remove();

  const { items, voirToutHref, voirToutLabel } = construireItemsSousOnglets(section);
  const cheminActuel = frame.contentWindow.location.pathname + frame.contentWindow.location.search;

  const nav = doc.createElement('nav');
  nav.id = 'wikiSubTabsInjectees';
  nav.style.cssText = 'display:flex; flex-wrap:wrap; align-items:center; gap:6px; padding:8px 20px; background:#1c1a16; border-bottom:1px solid #423d32;';

  items.forEach((it) => {
    const estActif = cheminActuel === it.href;
    const btn = doc.createElement('button');
    btn.type = 'button';
    stylerPastilleInjectee(btn, estActif);
    if (it.casse) {
      btn.textContent = `⚠ ${it.label}`;
      btn.title = 'Ce lien ne pointe plus vers une ressource existante — corrige-le via « ✏ Éditer »';
      btn.style.opacity = '0.6';
    } else {
      btn.textContent = it.label;
    }
    // navigue la fenêtre PARENTE (naviguerVersRessource, définie dans ce
    // même script) plutôt que l'iframe directement dès que le lien est
    // cassé — évite d'envoyer FlowMap charger un nom qui n'existe plus
    // (son propre message d'erreur serait correct mais moins clair que
    // celui, contextualisé, de la page wiki)
    btn.addEventListener('click', () => {
      if (it.casse) naviguerVersRessource(it.href, true, it.label);
      else frame.contentWindow.location.href = it.href;
    });
    nav.appendChild(btn);
  });
  const lienTout = doc.createElement('button');
  lienTout.type = 'button';
  lienTout.title = "Voir la liste complète de l'outil, dans cette même page";
  lienTout.addEventListener('click', () => { frame.contentWindow.location.href = voirToutHref; });
  stylerPastilleInjectee(lienTout, false);
  lienTout.style.marginLeft = '4px';
  lienTout.style.borderStyle = 'dashed';
  lienTout.style.color = '#8a8272';
  lienTout.textContent = voirToutLabel;
  nav.appendChild(lienTout);

  topbar.insertAdjacentElement('afterend', nav);

  // le CSS de l'outil réserve une hauteur fixe pour son propre canevas en
  // fonction de sa seule barre d'outils (ex. calc(100vh - 60px) chez
  // FlowMap) — sans corriger cette hauteur, la barre injectée mordrait sur
  // le canevas ou laisserait un vide ; on retire la hauteur réellement
  // mesurée de tout ce qui précède le canevas plutôt que de deviner une constante
  if (canvas) {
    const haut = Math.ceil(nav.getBoundingClientRect().bottom);
    canvas.style.height = `calc(100vh - ${haut}px)`;
  }
}

// la ressource réellement visée par l'onglet principal — pour un groupe,
// c'est resources[0] (voir hrefDeSection) ; pour une section normale, elle-même
function ressourceEffective(section) {
  return section && section.kind === 'tool-group' ? section.resources[0] : section;
}

// point d'entrée unique pour amener l'iframe sur une ressource — évite de
// dupliquer le repli « lien cassé » à chaque endroit qui navigue l'iframe
// (onglet principal, pastille de la barre parent, pastille injectée)
function naviguerVersRessource(href, casse, libelle) {
  const frame = document.getElementById('wikiViewFrame');
  const lienCasseEl = document.getElementById('wikiLienCasse');
  if (casse) {
    frame.style.display = 'none';
    lienCasseEl.style.display = 'block';
    lienCasseEl.textContent =
      `⚠ Ce lien (« ${libelle} ») ne pointe plus vers une ressource existante — ` +
      `probablement renommée ou supprimée directement dans l'outil. Corrige-le via « ✏ Éditer ».`;
    return;
  }
  lienCasseEl.style.display = 'none';
  frame.style.display = 'block';
  frame.src = href;
}

function activerOnglet(index) {
  ongletActif = index;
  document.querySelectorAll('.wiki-tab').forEach((btn, i) => btn.classList.toggle('actif', i === index));
  sectionActiveCourante = sectionsOngletsActuelles[index];

  const btn = document.querySelectorAll('.wiki-tab')[index];
  const ressource = ressourceEffective(sectionActiveCourante);
  naviguerVersRessource(btn.dataset.href, lienCasse(ressource), sectionActiveCourante.linkLabel || sectionActiveCourante.label);

  if (!CIBLES_INJECTION[sectionActiveCourante && sectionActiveCourante.tool]) {
    renderSubTabsParent(sectionActiveCourante);
  }
  positionerVuePleinEcran();
}

// ré-injecte à chaque chargement de l'iframe — y compris ceux déclenchés
// depuis l'intérieur même de la barre injectée (clic sur une pastille)
document.getElementById('wikiViewFrame').addEventListener('load', tenterInjectionSousOnglets);

function renderTabs(sections, toolConfigByKey) {
  const nav = document.getElementById('wikiTabs');
  nav.innerHTML = sections.map((section, i) => `
    <button type="button" class="wiki-tab${lienCasse(section) ? ' wiki-tab-casse' : ''}" data-href="${escapeHtml(hrefDeSection(section, toolConfigByKey))}"
            title="${lienCasse(section) ? 'Ce lien ne pointe plus vers une ressource existante (renommée ou supprimée dans l’outil) — corrige-le via « ✏ Éditer »' : ''}">
      <span class="wiki-tab-icon">${TOOL_ICONS[section.tool] || '📦'}</span>
      <span class="wiki-tab-text">
        <span class="wiki-tab-label">${lienCasse(section) ? '⚠ ' : ''}${escapeHtml(section.label)}</span>
        ${section.linkLabel && section.linkLabel !== section.label ? `<span class="wiki-tab-sublabel">${escapeHtml(section.linkLabel)}</span>` : ''}
      </span>
    </button>
  `).join('');

  [...nav.querySelectorAll('.wiki-tab')].forEach((btn, i) => {
    btn.addEventListener('click', () => activerOnglet(i));
  });
}

async function load() {
  if (!projectName) {
    document.getElementById('wikiLoading').style.display = 'none';
    document.getElementById('wikiError').style.display = 'block';
    document.getElementById('wikiError').textContent = 'Aucun projet spécifié.';
    return;
  }
  try {
    const [wikiRes, toolConfigRes] = await Promise.all([
      fetch(`/api/hub-projects/${encodeURIComponent(projectName)}/wiki`),
      fetch('/api/tool-config'),
    ]);
    if (!wikiRes.ok) {
      const data = await wikiRes.json().catch(() => ({}));
      throw new Error(data.error || `Erreur ${wikiRes.status}`);
    }
    const data = await wikiRes.json();
    const toolConfig = toolConfigRes.ok ? await toolConfigRes.json() : [];
    const toolConfigByKey = Object.fromEntries(toolConfig.map((t) => [t.key, t]));
    toolConfigByKeyActuel = toolConfigByKey;

    document.getElementById('wikiBrandName').textContent = data.name;

    // les ressources "document" (le GDD) passent en premier — c'est
    // l'onglet actif par défaut à l'ouverture de la page
    sectionsActuelles = [
      ...data.sections.filter((s) => s.kind === 'document'),
      ...data.sections.filter((s) => s.kind !== 'document'),
    ];

    // page par défaut : une ressource "document" (le GDD) occupe seule tout
    // l'écran, sans barre d'onglets. Page "?vue=outils" (bouton "✏ Éditer") :
    // la barre d'onglets montre les AUTRES ressources liées (PlanBoard,
    // FlowMap...) — sans le GDD, déjà vu juste avant sur la page par défaut,
    // pas besoin de le retrouver aussi ici.
    const docSection = sectionsActuelles.find((s) => s.kind === 'document');
    const sectionsOnglets = regrouperParOutil(
      vueOutils ? sectionsActuelles.filter((s) => s.kind !== 'document') : sectionsActuelles
    );
    sectionsOngletsActuelles = sectionsOnglets;
    const afficherOnglets = vueOutils || !docSection;
    const hasSections = sectionsActuelles.length > 0;
    const hasOnglets = sectionsOnglets.length > 0;
    document.body.classList.toggle('wiki-fullscreen', hasSections);
    document.getElementById('wikiTabs').style.display = afficherOnglets && hasOnglets ? 'flex' : 'none';
    document.getElementById('wikiViewFrame').style.display = hasSections ? 'block' : 'none';
    document.getElementById('wikiEmpty').style.display = hasOnglets ? 'none' : 'block';

    // rendre le conteneur visible AVANT de mesurer/positionner l'iframe —
    // getBoundingClientRect() sur la barre de référence renverrait un
    // rectangle nul tant que son ancêtre #wikiContent est display:none, ce
    // qui plaçait l'iframe à top:0 (recouvrant tout, y compris la barre du haut)
    document.getElementById('wikiLoading').style.display = 'none';
    document.getElementById('wikiContent').style.display = 'block';

    if (afficherOnglets && hasOnglets) {
      renderTabs(sectionsOnglets, toolConfigByKey);
      // ?outil=<clé> (posé par le clic sur « Éditer » depuis un onglet du
      // GDD mappé, ex. Flowcharts -> FlowMap) : ouvre directement cet outil
      // plutôt que systématiquement le premier onglet de la barre
      const outilVise = params.get('outil');
      const indexVise = outilVise ? sectionsOnglets.findIndex((s) => s.tool === outilVise) : -1;
      activerOnglet(indexVise >= 0 ? indexVise : 0); // appelle déjà positionerVuePleinEcran() en interne
    } else if (docSection) {
      // ?gddOnglet=<id> (posé par le clic sur « Éditer » depuis un outil
      // mappé, ex. FlowMap -> Flowcharts) : ouvre le GDD directement sur cet
      // onglet plutôt que systématiquement sur "Document"
      const ongletGddVise = params.get('gddOnglet');
      document.getElementById('wikiViewFrame').src =
        hrefDeSection(docSection, toolConfigByKey) + (ongletGddVise ? `#${encodeURIComponent(ongletGddVise)}` : '');
      positionerVuePleinEcran();
    }
  } catch (err) {
    document.getElementById('wikiLoading').style.display = 'none';
    document.getElementById('wikiError').style.display = 'block';
    document.getElementById('wikiError').textContent = `Impossible de charger la page wiki : ${err.message}`;
  }
}

// exposé pour le harnais de vérification (jsdom), qui peut ainsi attendre la
// fin du premier chargement au lieu de deviner un délai
window.__ready = load();
