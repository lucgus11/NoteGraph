// ---------------------------------------------------------------------------
// Point d'entrée : orchestre File System Access, Web Worker de parsing,
// moteur de graphe, éditeur, IndexedDB et Service Worker (PWA offline).
// ---------------------------------------------------------------------------
import "./style.css";
import type { GraphEdge, NoteFile, ParseResponseMessage } from "./types";
import { FileSystemService } from "./fileSystem";
import { GraphEngine } from "./graph";
import { NoteEditor } from "./editor";
import { loadPreferences, savePreferences } from "./db";

// --- Références DOM ---------------------------------------------------------

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const btnOpenFolder = $<HTMLButtonElement>("btn-open-folder");
const btnNewNote = $<HTMLButtonElement>("btn-new-note");
const btnResetView = $<HTMLButtonElement>("btn-reset-view");
const folderNameEl = $<HTMLSpanElement>("folder-name");
const saveStatusEl = $<HTMLSpanElement>("save-status");
const noteTitleEl = $<HTMLInputElement>("note-title");
const graphStatsEl = $<HTMLSpanElement>("graph-stats");
const rangeRepulsion = $<HTMLInputElement>("range-repulsion");
const rangeAttraction = $<HTMLInputElement>("range-attraction");
const canvas = $<HTMLCanvasElement>("graph-canvas");
const textarea = $<HTMLTextAreaElement>("editor");
const autocompleteEl = $<HTMLUListElement>("autocomplete");
const resizer = $<HTMLDivElement>("resizer");
const editorPane = $<HTMLElement>("editor-pane");

// --- État applicatif ---------------------------------------------------------

const fsService = new FileSystemService();
const parseWorker = new Worker(new URL("./parser.worker.ts", import.meta.url), {
  type: "module"
});

let notes: NoteFile[] = [];
let currentNote: NoteFile | null = null;
let saveTimer: number | undefined;
let indexTimer: number | undefined;

const graph = new GraphEngine(canvas, {
  onNodeClick: (id) => openNoteById(id)
});

const editor = new NoteEditor(textarea, autocompleteEl, {
  onChange: (content) => {
    if (!currentNote) return;
    currentNote.content = content;
    setSaveStatus("editing");
    scheduleAutosave();
    scheduleReindex();
  }
});

// --- Initialisation ------------------------------------------------------

init();

async function init(): Promise<void> {
  registerServiceWorker();

  rangeRepulsion.addEventListener("input", () => {
    graph.setPhysicsSettings({ repulsion: Number(rangeRepulsion.value) });
  });
  rangeAttraction.addEventListener("input", () => {
    graph.setPhysicsSettings({ attraction: Number(rangeAttraction.value) });
  });
  btnResetView.addEventListener("click", () => graph.resetView());
  btnOpenFolder.addEventListener("click", () => void openFolder());
  btnNewNote.addEventListener("click", () => void createNewNote());
  bindResizer();

  const prefs = await loadPreferences();
  if (prefs?.physics) {
    graph.setPhysicsSettings(prefs.physics);
    rangeRepulsion.value = String(prefs.physics.repulsion);
    rangeAttraction.value = String(prefs.physics.attraction);
  }
  if (prefs?.zoom !== undefined) {
    graph.setViewState(prefs.zoom, prefs.panX, prefs.panY);
  }

  if (prefs?.lastDirectoryHandle) {
    setSaveStatus("idle", "Reconnexion au dernier dossier…");
    const ok = await fsService.useDirectory(prefs.lastDirectoryHandle);
    if (ok) {
      await loadNotesFromDisk(prefs.nodePositions);
    } else {
      setSaveStatus("idle", "Prêt — autorisez l'accès au dossier pour continuer");
    }
  }
}

// --- Ouverture de dossier & chargement des notes ----------------------------

async function openFolder(): Promise<void> {
  try {
    const handle = await fsService.pickDirectory();
    folderNameEl.textContent = handle.name;
    btnNewNote.disabled = false;
    await savePreferences({ lastDirectoryHandle: handle });
    await loadNotesFromDisk();
  } catch (err) {
    if ((err as DOMException)?.name !== "AbortError") {
      console.error(err);
      setSaveStatus("error", "Impossible d'ouvrir le dossier");
    }
  }
}

async function loadNotesFromDisk(savedPositions?: Record<string, { x: number; y: number }>): Promise<void> {
  setSaveStatus("idle", "Chargement des notes…");
  notes = await fsService.listMarkdownFiles();
  folderNameEl.textContent = fsService.root?.name ?? "";
  btnNewNote.disabled = !fsService.root;

  await Promise.all(
    notes.map(async (n) => {
      n.content = await fsService.readNote(n);
    })
  );

  editor.setAvailableNoteNames(notes.map((n) => n.id));
  reindexGraph(savedPositions);
  setSaveStatus("idle", `Prêt — ${notes.length} note(s) chargée(s)`);
}

// --- Indexation (Web Worker) & construction du graphe -----------------------

function scheduleReindex(): void {
  window.clearTimeout(indexTimer);
  indexTimer = window.setTimeout(() => reindexGraph(), 400);
}

function reindexGraph(savedPositions?: Record<string, { x: number; y: number }>): void {
  if (notes.length === 0) {
    graph.setData([], []);
    updateGraphStats();
    return;
  }

  parseWorker.postMessage({
    type: "parse-all",
    notes: notes.map((n) => ({ id: n.id, content: n.content ?? "" }))
  });

  parseWorker.onmessage = (ev: MessageEvent<ParseResponseMessage>) => {
    if (ev.data.type !== "parse-result") return;
    const byId = new Map(notes.map((n) => [n.id, n]));
    const edges: GraphEdge[] = [];

    for (const p of ev.data.parsed) {
      for (const linkName of p.outgoingLinks) {
        // Résolution tolérante : correspondance exacte, sinon insensible à la casse.
        const target =
          byId.get(linkName) ??
          notes.find((n) => n.id.toLowerCase() === linkName.toLowerCase());
        if (target) edges.push({ source: p.id, target: target.id });
      }
    }

    const nodes = ev.data.parsed.map((p) => ({
      id: p.id,
      label: byId.get(p.id)?.id ?? p.id,
      tags: p.tags
    }));

    graph.setData(nodes, edges, savedPositions);
    updateGraphStats(nodes.length, edges.length);
  };
}

function updateGraphStats(nodeCount = 0, edgeCount = 0): void {
  graphStatsEl.textContent = `${nodeCount} note(s) · ${edgeCount} lien(s)`;
}

// --- Sélection / ouverture d'une note ---------------------------------------

function openNoteById(id: string): void {
  const note = notes.find((n) => n.id === id);
  if (note) void openNote(note);
}

async function openNote(note: NoteFile): Promise<void> {
  if (note.content === undefined) {
    note.content = await fsService.readNote(note);
  }
  currentNote = note;
  editor.setContent(note.content);
  editor.setEnabled(true);
  noteTitleEl.value = note.id;
  noteTitleEl.disabled = false;
  editor.focus();
  setSaveStatus("saved", "Note chargée");
}

async function createNewNote(): Promise<void> {
  const title = prompt("Nom de la nouvelle note :", "Nouvelle note");
  if (!title) return;
  try {
    const note = await fsService.createNote(title);
    note.content = await fsService.readNote(note);
    notes.push(note);
    editor.setAvailableNoteNames(notes.map((n) => n.id));
    await openNote(note);
    reindexGraph();
  } catch (err) {
    console.error(err);
    setSaveStatus("error", "Impossible de créer la note");
  }
}

// --- Sauvegarde automatique --------------------------------------------------

function scheduleAutosave(): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveCurrentNote(), 600);
}

async function saveCurrentNote(): Promise<void> {
  if (!currentNote || currentNote.content === undefined) return;
  try {
    await fsService.writeNote(currentNote, currentNote.content);
    currentNote.lastSavedAt = Date.now();
    setSaveStatus("saved", "Sauvegardé ✓");
  } catch (err) {
    console.error(err);
    setSaveStatus("error", "Échec de la sauvegarde");
  }
}

function setSaveStatus(state: "idle" | "editing" | "saved" | "error", label?: string): void {
  saveStatusEl.dataset.state = state;
  saveStatusEl.textContent =
    label ?? { idle: "Prêt", editing: "Modification…", saved: "Sauvegardé ✓", error: "Erreur" }[state];
}

// --- Redimensionnement du split-view -----------------------------------------

function bindResizer(): void {
  let dragging = false;
  resizer.addEventListener("mousedown", () => {
    dragging = true;
    document.body.style.cursor = "col-resize";
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const total = editorPane.parentElement!.clientWidth;
    const pct = Math.min(75, Math.max(20, (e.clientX / total) * 100));
    editorPane.style.flexBasis = `${pct}%`;
  });
  window.addEventListener("mouseup", () => {
    dragging = false;
    document.body.style.cursor = "";
  });
}

// --- Persistance périodique des préférences (positions, zoom, physique) -----

window.setInterval(() => {
  const { zoom, panX, panY } = graph.getViewState();
  void savePreferences({
    zoom,
    panX,
    panY,
    physics: graph.getPhysicsSettings(),
    nodePositions: graph.getNodePositions()
  });
}, 5000);

// --- Service Worker (PWA offline) --------------------------------------------

function registerServiceWorker(): void {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((err) => {
        console.warn("Échec d'enregistrement du Service Worker:", err);
      });
    });
  }
}
