// Données des projets affichés sur le hub. Ajouter un projet = ajouter un
// objet ici, aucun changement HTML/CSS nécessaire (script.js génère les
// cartes à partir de ce tableau).
//
// Champs :
//   name          nom affiché
//   tagline       une phrase courte (sous le nom)
//   description   1-3 phrases
//   tech          tableau de badges techno
//   status        court statut ("En développement", "Prototype", ...)
//   repoUrl       URL réelle du dépôt si publié, sinon null (pas de lien inventé)
//   localCommand  commande pour lancer le projet en local, ou null
//   localUrl      URL locale une fois lancé (ex. http://localhost:3000), ou null
//                 — laissé à null quand hostedPath est renseigné : un seul
//                 lien plutôt que deux vers des origines différentes, qui
//                 casseraient la session entre l'un et l'autre
//   hostedPath    chemin sur CE hub si l'outil y est hébergé (ex. '/datasite/'),
//                 ou null si l'outil n'est pas (encore) proxifié par le hub
//   screenshots      tableau de chemins d'images (ex. 'assets/datasite/1.png'),
//                    optionnel — absent/[] si aucune (n'affiche rien dans la modale)
//   longDescription  texte plus détaillé pour la vue détail ; si absent,
//                    la modale retombe sur `description`
//   changelog        tableau [{ date: 'YYYY-MM-DD', text: '...' }], plus récent
//                    en premier, optionnel — absent/[] si aucun
const PROJECTS = [
  {
    name: 'DataSite',
    tagline: 'Navigateur et éditeur de bases SQLite en local',
    description: "Interface complète pour explorer et modifier des bases SQLite : tables, relations entre tables, colonnes calculées/formule, mise en forme conditionnelle, vue schéma avec liaisons par glisser-déposer.",
    tech: ['Node.js', 'Express', 'better-sqlite3', 'JS vanilla'],
    status: 'En développement actif',
    repoUrl: 'https://github.com/TRYMOX/DataSite',
    localCommand: 'node backend/server.js',
    localUrl: null,
    hostedPath: '/datasite/',
  },
  {
    name: 'SiteBuilder',
    tagline: 'Éditeur de pages en glisser-déposer',
    description: "Compose des pages web à partir de blocs (titres, images, formulaires, navigation...), avec thèmes de design, positionnement libre, sauvegarde de projets multi-pages et export HTML/CSS autonome.",
    tech: ['Node.js', 'Express', 'JS vanilla'],
    status: 'En développement actif',
    repoUrl: 'https://github.com/TRYMOX/SiteBuilder',
    localCommand: 'node backend/server.js',
    localUrl: null,
    hostedPath: '/sitebuilder/',
  },
  {
    name: 'PlanBoard',
    tagline: 'Planification de projet : tâches et notes',
    description: "Tableau de tâches (statut, priorité, échéance, étiquettes, sous-listes) avec glisser-déposer, sélection multiple et recherche globale, plus des pages de notes avec aperçu Markdown — thème clair/sombre, import/export JSON et CSV.",
    longDescription: "Découpe un gros projet en tâches organisées par statut (à faire / en cours / fait), avec priorité, échéance, étiquettes libres et sous-listes à cocher. Glisser-déposer pour réordonner ou changer de colonne, sélection multiple avec actions groupées, tri par priorité/échéance, archivage des tâches terminées et suivi du temps passé. Recherche à travers tous les projets à la fois depuis l'écran d'accueil. Les pages de notes ont un aperçu Markdown basique. Import/export JSON (sauvegarde, duplication de projet) et export CSV des tâches ; thème clair/sombre ; export/impression PDF du tableau.",
    tech: ['Node.js', 'Express', 'JS vanilla'],
    status: 'En développement actif',
    repoUrl: 'https://github.com/TRYMOX/PlanBoard',
    localCommand: 'node backend/server.js',
    localUrl: null,
    hostedPath: '/planboard/',
    changelog: [
      { date: '2026-07-11', text: "Renommer/dupliquer un projet, suivi du temps passé, vue « échéances proches », vue compacte, notes épinglées, export/impression PDF, indicateur de retard sur les cartes projet." },
      { date: '2026-07-11', text: "Thème clair/sombre, glisser-déposer des notes, étiquettes, sous-listes à cocher, annuler une suppression, sélection multiple avec actions groupées, import JSON, recherche globale multi-projets." },
      { date: '2026-07-11', text: "Dates d'échéance et priorité, recherche/filtre, glisser-déposer des tâches, raccourcis clavier, export JSON, mise en page responsive et accessibilité clavier." },
    ],
  },
];

// liens affichés sous la bio À propos — jamais inventés, uniquement des
// coordonnées réelles confirmées
const CONTACT_LINKS = [
  { label: 'Email', url: 'mailto:trymox545@gmail.com' },
  { label: 'GitHub', url: 'https://github.com/TRYMOX' },
];
