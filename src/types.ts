// ---------------------------------------------------------------------------
// Types partagés de l'application NoteGraph
// ---------------------------------------------------------------------------

/** Vecteur 2D utilisé par le moteur physique du graphe. */
export interface PhysicsVector {
  x: number;
  y: number;
}

/** Une note Markdown chargée depuis le système de fichiers local. */
export interface NoteFile {
  /** Nom du fichier sans extension, sert d'identifiant unique de note. */
  id: string;
  /** Nom de fichier complet, ex: "Idée.md". */
  fileName: string;
  /** Handle natif vers le fichier (File System Access API). */
  handle: FileSystemFileHandle;
  /** Chemin relatif au dossier racine (pour affichage / debug). */
  path: string;
  /** Contenu Markdown brut, chargé paresseusement. */
  content?: string;
  /** Timestamp de dernière sauvegarde réussie. */
  lastSavedAt?: number;
}

/** Résultat du parsing d'une note : liens sortants et tags détectés. */
export interface ParsedNote {
  id: string;
  outgoingLinks: string[]; // noms de notes référencées via [[Nom]]
  tags: string[]; // tags détectés via #tag
}

/** Message envoyé au Web Worker de parsing. */
export interface ParseRequestMessage {
  type: "parse-all";
  notes: { id: string; content: string }[];
}

/** Message renvoyé par le Web Worker de parsing. */
export interface ParseResponseMessage {
  type: "parse-result";
  parsed: ParsedNote[];
}

/** Nœud du graphe (une note), avec état physique de simulation. */
export interface NoteNode {
  id: string;
  label: string;
  tags: string[];
  /** Taille visuelle, dérivée du degré (liens entrants + sortants). */
  radius: number;
  /** Couleur dérivée du tag principal. */
  color: string;
  position: PhysicsVector;
  velocity: PhysicsVector;
  /** Fixé par l'utilisateur pendant un drag (ignore les forces). */
  pinned: boolean;
  inDegree: number;
  outDegree: number;
}

/** Arête du graphe reliant deux notes. */
export interface GraphEdge {
  source: string; // id du nœud source
  target: string; // id du nœud cible
}

/** Structure complète du graphe. */
export interface GraphData {
  nodes: Map<string, NoteNode>;
  edges: GraphEdge[];
}

/** Paramètres réglables de la simulation à base de forces. */
export interface PhysicsSettings {
  repulsion: number; // force de répulsion électrostatique
  attraction: number; // raideur des ressorts (liens)
  damping: number; // amortissement (0-1)
}

/** Préférences utilisateur persistées dans IndexedDB. */
export interface UserPreferences {
  id: "singleton";
  lastDirectoryHandle?: FileSystemDirectoryHandle;
  zoom?: number;
  panX?: number;
  panY?: number;
  physics?: PhysicsSettings;
  nodePositions?: Record<string, PhysicsVector>;
}
