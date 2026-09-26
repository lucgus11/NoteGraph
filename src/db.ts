// ---------------------------------------------------------------------------
// Persistance légère via IndexedDB : préférences utilisateur, handle du
// dernier dossier ouvert (les FileSystemHandle sont structured-cloneable et
// peuvent être stockés directement dans IndexedDB), positions des nœuds, zoom.
// ---------------------------------------------------------------------------
import type { UserPreferences } from "./types";

const DB_NAME = "notegraph-db";
const DB_VERSION = 1;
const STORE = "preferences";
const KEY = "singleton";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadPreferences(): Promise<UserPreferences | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req = store.get(KEY);
      req.onsuccess = () => resolve((req.result as UserPreferences) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function savePreferences(prefs: Partial<UserPreferences>): Promise<void> {
  try {
    const db = await openDb();
    const existing = (await loadPreferences()) ?? { id: KEY };
    const merged: UserPreferences = { ...existing, ...prefs, id: KEY };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(merged);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Impossible de sauvegarder les préférences:", err);
  }
}
