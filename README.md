# NoteGraph

PWA **100 % local-first et hors-ligne**, écrite en TypeScript strict et
HTML5/CSS3 natifs (aucun framework UI). Elle gère des notes Markdown stockées
directement sur votre appareil (via la **File System Access API**) et
visualise leurs connexions `[[liens]]` dans un **graphe 2D à base de forces**,
dessiné sur `<canvas>` sans bibliothèque externe.

## Fonctionnalités

- Ouverture d'un dossier local (`window.showDirectoryPicker`), lecture/écriture
  transparente des fichiers `.md`, sauvegarde automatique avec indicateur de statut.
- Parsing des liens `[[Nom]]` et tags `#tag` dans un **Web Worker** (thread séparé,
  UI fluide à 60 FPS même sur de gros dossiers).
- Moteur de graphe maison : répulsion électrostatique, ressorts sur les liens,
  amortissement, zoom/pan, drag de nœuds, survol qui met en évidence les connexions,
  clic pour ouvrir la note dans l'éditeur.
- Éditeur avec auto-complétion des liens internes en tapant `[[`.
- **PWA** : Service Worker vanilla (cache-first + repli hors-ligne), manifeste
  installable, fonctionne sans connexion après un premier chargement.
- **IndexedDB** : mémorise le dernier dossier ouvert (le handle lui-même, réutilisé
  après re-permission), les positions des nœuds, le zoom/pan et les réglages physiques.

## Arborescence du projet

```
notegraph-pwa/
├── index.html              # coquille applicative (split-view éditeur / graphe)
├── vite.config.ts
├── tsconfig.json
├── package.json
├── vercel.json              # config de déploiement Vercel
├── public/
│   ├── sw.js                # Service Worker (cache offline)
│   ├── manifest.webmanifest # manifeste PWA
│   └── icons/                # icône SVG + PNG 192/512
└── src/
    ├── main.ts               # orchestration générale
    ├── types.ts               # interfaces (NoteNode, GraphEdge, PhysicsVector, …)
    ├── fileSystem.ts           # wrapper File System Access API
    ├── fs-access.d.ts          # déclarations d'appoint pour cette API
    ├── parser.worker.ts        # Web Worker : extraction liens/tags
    ├── graph.ts                # simulation physique + rendu Canvas
    ├── editor.ts                # éditeur + auto-complétion [[
    ├── db.ts                     # persistance IndexedDB
    └── style.css
```

## Prérequis

- Node.js ≥ 18
- Un navigateur supportant la File System Access API (Chrome, Edge, Opera,
  ou tout Chromium ≥ 86 desktop ; sur mobile/Chromebook : Chrome Android/ChromeOS).
  Firefox et Safari n'implémentent pas encore cette API — l'app se charge mais
  le bouton "Ouvrir un dossier" ne fonctionnera pas dans ces navigateurs.

## Installation & développement local

```bash
npm install
npm run dev
```

Ouvrez l'URL affichée (par défaut `http://localhost:5173`). En développement,
la File System Access API fonctionne sur `localhost` (contexte sécurisé).

## Build de production

```bash
npm run build
npm run preview   # pour tester le build localement
```

Le résultat est généré dans `dist/`.

## Déploiement sur GitHub + Vercel

### 1. Pousser le code sur GitHub

```bash
git init
git add .
git commit -m "Initial commit — NoteGraph PWA"
git branch -M main
git remote add origin https://github.com/<votre-utilisateur>/notegraph-pwa.git
git push -u origin main
```

### 2. Déployer sur Vercel

**Option A — via le dashboard Vercel**
1. Allez sur [vercel.com/new](https://vercel.com/new) et importez le repo GitHub.
2. Vercel détecte Vite automatiquement. Vérifiez :
   - Build Command : `npm run build`
   - Output Directory : `dist`
3. Cliquez sur **Deploy**.

**Option B — via la CLI**
```bash
npm install -g vercel
vercel login
vercel --prod
```

Le fichier `vercel.json` fourni configure déjà la commande de build, le dossier
de sortie, les en-têtes nécessaires au Service Worker (`Service-Worker-Allowed`)
et le fallback SPA vers `index.html`.

> ⚠️ La File System Access API et les Service Workers exigent **HTTPS**
> (ou `localhost`). Le domaine `*.vercel.app` fourni par Vercel est en HTTPS
> par défaut — aucune configuration supplémentaire n'est nécessaire.

### 3. Installer la PWA

Une fois déployée, ouvrez l'URL Vercel dans Chrome/Edge : une icône
d'installation apparaît dans la barre d'adresse (ou menu ⋮ → "Installer
NoteGraph"). L'app s'installe alors comme une application native et fonctionne
hors-ligne après le premier chargement.

## Notes techniques

- **Aucune dépendance runtime** : `vite` et `typescript` ne sont utilisés
  qu'en tant qu'outils de build/compilation, pas dans le bundle final.
- Le moteur physique est en O(n²) sur le nombre de nœuds — largement
  suffisant pour des bases de plusieurs centaines/milliers de notes
  personnelles ; au-delà, un partitionnement spatial (quadtree/Barnes-Hut)
  serait la prochaine optimisation.
- Les permissions du File System Access API sont re-demandées à chaque
  session pour le dossier mémorisé (limitation de sécurité du navigateur,
  pas de l'application) — l'utilisateur doit valider un prompt de
  confirmation au redémarrage.
