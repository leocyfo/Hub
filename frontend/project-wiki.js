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
  snippetbox: '✂️', moodboard: '🎨', themeforge: '🌈', flowmap: '🔀', apitester: '🛰️',
};

const params = new URLSearchParams(location.search);
const projectName = params.get('project') || '';

// un projet peut lier deux fois le même outil (ex. deux snippets) — l'index
// départage les ancres pour qu'elles restent uniques dans ce cas
function sectionAnchorId(section, index) {
  const slug = String(section.resourceId).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `wiki-section-${section.tool}-${slug || 'x'}-${index}`;
}

// résumé tenant sur une ligne, utilisé par la grille de cartes ET le
// sommaire — pas de duplication de la logique de rendu détaillé
// (renderSectionBody), juste l'essentiel pour se repérer avant de cliquer
function sectionKeyStat(section) {
  if (section.unreachable) return 'Indisponible';
  if (section.missing) return 'Supprimée';
  switch (section.kind) {
    case 'database': return `${section.tables.length} table${section.tables.length === 1 ? '' : 's'}`;
    case 'pages': return `${section.pageCount} page${section.pageCount === 1 ? '' : 's'}`;
    case 'tasks': {
      const c = section.statusCounts;
      return `${c.todo + c.doing + c.done} tâche${(c.todo + c.doing + c.done) === 1 ? '' : 's'}`;
    }
    case 'vault': return `${section.entryCount} entrée${section.entryCount === 1 ? '' : 's'}`;
    case 'snippet': return section.language;
    case 'moodboard': return `${section.itemCount} élément${section.itemCount === 1 ? '' : 's'}`;
    case 'palette': return `${section.colors.length} couleur${section.colors.length === 1 ? '' : 's'}`;
    case 'flow': return `${section.nodeCount} nœud${section.nodeCount === 1 ? '' : 's'}`;
    case 'request': return section.method;
    default: return '';
  }
}

function renderMissing(section) {
  return `<p class="wiki-notice">Cette ressource n'existe plus dans ${escapeHtml(section.label)} — elle a peut-être été renommée ou supprimée depuis.</p>`;
}

function renderUnreachable(section) {
  return `<p class="wiki-notice wiki-notice-warn">${escapeHtml(section.label)} n'a pas répondu — résumé indisponible pour l'instant.</p>`;
}

// en-têtes cliquables : data-sort="text|number" active le tri, une colonne
// sans cet attribut (ex. la pastille de couleur) reste non triable
function renderSectionBody(section) {
  switch (section.kind) {
    case 'database':
      return section.tables.length ? `
        <table class="wiki-table">
          <thead><tr><th data-sort="text">Table</th><th data-sort="number">Lignes</th></tr></thead>
          <tbody>${section.tables.map((t) =>
            `<tr><td>${escapeHtml(t.name)}</td><td data-value="${t.rowCount}">${t.rowCount}</td></tr>`).join('')}</tbody>
        </table>` : '<p class="wiki-empty">Aucune table.</p>';

    case 'pages':
      return `<p class="wiki-summary-line">${section.pageCount} page${section.pageCount === 1 ? '' : 's'}${section.theme ? ` · thème ${escapeHtml(section.theme)}` : ''}</p>
        ${section.pageNames.length ? `
        <table class="wiki-table">
          <thead><tr><th data-sort="text">Page</th></tr></thead>
          <tbody>${section.pageNames.map((n) => `<tr><td>${escapeHtml(n)}</td></tr>`).join('')}</tbody>
        </table>` : ''}`;

    case 'tasks': {
      const c = section.statusCounts;
      return `<div class="wiki-badges">
          <span class="status-pill status-dim">${c.todo} à faire</span>
          <span class="status-pill status-info">${c.doing} en cours</span>
          <span class="status-pill status-ok">${c.done} terminée${c.done === 1 ? '' : 's'}</span>
          ${section.overdueCount ? `<span class="status-pill status-accent">${section.overdueCount} en retard</span>` : ''}
        </div>
        <p class="wiki-summary-line">${section.noteCount} note${section.noteCount === 1 ? '' : 's'}${section.pinned ? ' · épinglé' : ''}</p>`;
    }

    case 'vault':
      return `<p class="wiki-summary-line">${section.entryCount} entrée${section.entryCount === 1 ? '' : 's'} — valeurs non affichées ici.</p>`;

    case 'snippet':
      return `<p class="wiki-summary-line">${escapeHtml(section.language)}${section.description ? ' · ' + escapeHtml(section.description) : ''}</p>
        ${section.tags.length ? `<div class="wiki-badges">${section.tags.map((t) => `<span class="tech-badge">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        <pre class="wiki-code">${escapeHtml(section.codePreview)}${section.codeTruncated ? '\n…' : ''}</pre>`;

    case 'moodboard':
      return `<p class="wiki-summary-line">${section.itemCount} élément${section.itemCount === 1 ? '' : 's'} — ${Object.entries(section.countsByType).map(([type, n]) => `${n} ${escapeHtml(type)}`).join(', ') || 'aucun'}</p>
        ${section.colors.length ? `
        <table class="wiki-table">
          <thead><tr><th>Aperçu</th><th data-sort="text">Libellé</th><th data-sort="text">Hex</th></tr></thead>
          <tbody>${section.colors.map((c) =>
            `<tr><td><span class="wiki-swatch" style="background:${escapeHtml(c.hex)}"></span></td><td>${escapeHtml(c.label || '—')}</td><td class="wiki-code-cell">${escapeHtml(c.hex)}</td></tr>`).join('')}</tbody>
        </table>` : ''}`;

    case 'palette':
      return `<p class="wiki-summary-line">${escapeHtml(section.baseHex)} · ${escapeHtml(section.mode)}</p>
        <table class="wiki-table">
          <thead><tr><th>Aperçu</th><th data-sort="text">Hex</th></tr></thead>
          <tbody>${section.colors.map((hex) =>
            `<tr><td><span class="wiki-swatch" style="background:${escapeHtml(hex)}"></span></td><td class="wiki-code-cell">${escapeHtml(hex)}</td></tr>`).join('')}</tbody>
        </table>`;

    case 'flow':
      return `<p class="wiki-summary-line">${section.nodeCount} nœud${section.nodeCount === 1 ? '' : 's'} · ${section.edgeCount} lien${section.edgeCount === 1 ? '' : 's'}</p>`;

    case 'request':
      return `<p class="wiki-summary-line"><span class="wiki-method">${escapeHtml(section.method)}</span> ${escapeHtml(section.url)}</p>
        ${section.label ? `<p class="wiki-summary-line">${escapeHtml(section.label)}</p>` : ''}`;

    default:
      return `<p class="wiki-notice">Type de ressource inconnu.</p>`;
  }
}

function renderSection(section, index) {
  return `
    <section class="wiki-section" id="${sectionAnchorId(section, index)}">
      <div class="wiki-section-header">
        <span class="wiki-section-icon">${TOOL_ICONS[section.tool] || '📦'}</span>
        <div>
          <h2 class="wiki-section-title">${escapeHtml(section.label)}</h2>
          <p class="wiki-section-resource">${escapeHtml(section.linkLabel)}</p>
        </div>
      </div>
      <div class="wiki-section-body">
        ${section.unreachable ? renderUnreachable(section) : section.missing ? renderMissing(section) : renderSectionBody(section)}
      </div>
    </section>
  `;
}

// grille de cartes cliquables en haut de page — sert de point d'entrée
// visuel ET de sommaire, sur le modèle des cartes "Core Concepts" d'un wiki
// de jeu : une vignette par ressource liée, clic = saute à la section détaillée
function renderCard(section, index) {
  const stateClass = section.unreachable ? ' wiki-toc-card-warn' : section.missing ? ' wiki-toc-card-dim' : '';
  return `
    <a class="wiki-toc-card${stateClass}" href="#${sectionAnchorId(section, index)}">
      <span class="wiki-toc-card-icon">${TOOL_ICONS[section.tool] || '📦'}</span>
      <span class="wiki-toc-card-label">${escapeHtml(section.label)}</span>
      <span class="wiki-toc-card-resource">${escapeHtml(section.linkLabel)}</span>
      <span class="wiki-toc-card-stat">${escapeHtml(sectionKeyStat(section))}</span>
    </a>
  `;
}

// sommaire latéral : même liste de liens que la grille de cartes, en version
// compacte pour naviguer sans remonter en haut de page
function renderTocEntry(section, index) {
  return `
    <a class="wiki-toc-link" href="#${sectionAnchorId(section, index)}">
      <span class="wiki-toc-link-icon">${TOOL_ICONS[section.tool] || '📦'}</span>
      <span class="wiki-toc-link-text">${escapeHtml(section.label)}</span>
    </a>
  `;
}

// active le tri au clic sur les en-têtes marqués data-sort — un seul
// gestionnaire générique pour tous les tableaux de la page plutôt qu'un par
// type de section, puisque le balisage (thead/tbody, data-value) est uniforme
function attachSortableTables(root) {
  root.querySelectorAll('table.wiki-table').forEach((table) => {
    const headers = [...table.querySelectorAll('thead th')];
    headers.forEach((th, colIndex) => {
      if (!th.dataset.sort) return;
      th.classList.add('wiki-sortable');
      th.addEventListener('click', () => {
        const nextDir = th.dataset.dir === 'asc' ? 'desc' : 'asc';
        headers.forEach((h) => { delete h.dataset.dir; h.classList.remove('wiki-sort-asc', 'wiki-sort-desc'); });
        th.dataset.dir = nextDir;
        th.classList.add(nextDir === 'asc' ? 'wiki-sort-asc' : 'wiki-sort-desc');

        const tbody = table.querySelector('tbody');
        const rows = [...tbody.querySelectorAll('tr')];
        const isNumber = th.dataset.sort === 'number';
        rows.sort((a, b) => {
          const cellA = a.children[colIndex];
          const cellB = b.children[colIndex];
          const rawA = cellA.dataset.value ?? cellA.textContent;
          const rawB = cellB.dataset.value ?? cellB.textContent;
          const va = isNumber ? Number(rawA) : rawA.trim().toLowerCase();
          const vb = isNumber ? Number(rawB) : rawB.trim().toLowerCase();
          if (va < vb) return nextDir === 'asc' ? -1 : 1;
          if (va > vb) return nextDir === 'asc' ? 1 : -1;
          return 0;
        });
        rows.forEach((r) => tbody.appendChild(r));
      });
    });
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
    const res = await fetch(`/api/hub-projects/${encodeURIComponent(projectName)}/wiki`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Erreur ${res.status}`);
    }
    const data = await res.json();
    document.getElementById('wikiName').textContent = data.name;
    document.getElementById('wikiDesc').textContent = data.description;
    document.getElementById('wikiDesc').style.display = data.description ? 'block' : 'none';
    document.getElementById('wikiUpdated').textContent = data.updatedAt ? `Mis à jour le ${new Date(data.updatedAt).toLocaleString('fr-FR')}` : '';
    document.getElementById('wikiToolCount').textContent = `${data.sections.length} outil${data.sections.length === 1 ? '' : 's'} lié${data.sections.length === 1 ? '' : 's'}`;

    if (data.sections.length) {
      document.getElementById('wikiToc').innerHTML = data.sections.map(renderTocEntry).join('');
      document.getElementById('wikiCardGrid').innerHTML = data.sections.map(renderCard).join('');
      document.getElementById('wikiSections').innerHTML = data.sections.map(renderSection).join('');
      attachSortableTables(document.getElementById('wikiSections'));
    } else {
      document.getElementById('wikiToc').innerHTML = '';
      document.getElementById('wikiCardGrid').innerHTML = '';
      document.getElementById('wikiSections').innerHTML = '<p class="wiki-placeholder">Aucun outil lié à ce projet pour l\'instant.</p>';
    }

    document.getElementById('wikiLoading').style.display = 'none';
    document.getElementById('wikiContent').style.display = 'flex';
  } catch (err) {
    document.getElementById('wikiLoading').style.display = 'none';
    document.getElementById('wikiError').style.display = 'block';
    document.getElementById('wikiError').textContent = `Impossible de charger la page wiki : ${err.message}`;
  }
}

// exposé pour le harnais de vérification (jsdom), qui peut ainsi attendre la
// fin du premier chargement au lieu de deviner un délai
window.__ready = load();
