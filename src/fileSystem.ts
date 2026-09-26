// ---------------------------------------------------------------------------
// Accès bidirectionnel au système de fichiers local via la File System
// Access API. Charge récursivement les .md d'un dossier, lit/écrit leur
// contenu de façon transparente.
// ---------------------------------------------------------------------------
import type { NoteFile } from "./types";

export class FileSystemService {
  private rootHandle: FileSystemDirectoryHandle | null = null;

  get root(): FileSystemDirectoryHandle | null {
    return this.rootHandle;
  }

  /** Ouvre le sélecteur de dossier natif et retient le handle racine. */
  async pickDirectory(): Promise<FileSystemDirectoryHandle> {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    this.rootHandle = handle;
    return handle;
  }

  /** Réutilise un handle déjà accordé (ex: restauré depuis IndexedDB). */
  async useDirectory(handle: FileSystemDirectoryHandle): Promise<boolean> {
    const granted = await this.ensurePermission(handle);
    if (granted) this.rootHandle = handle;
    return granted;
  }

  /** Vérifie / redemande la permission readwrite sur un handle. */
  async ensurePermission(handle: FileSystemHandle): Promise<boolean> {
    if (!handle.queryPermission || !handle.requestPermission) return true;
    const opts = { mode: "readwrite" as const };
    let state = await handle.queryPermission(opts);
    if (state === "granted") return true;
    state = await handle.requestPermission(opts);
    return state === "granted";
  }

  /** Parcourt récursivement le dossier racine et retourne tous les .md. */
  async listMarkdownFiles(): Promise<NoteFile[]> {
    if (!this.rootHandle) throw new Error("Aucun dossier ouvert");
    const results: NoteFile[] = [];
    await this.walk(this.rootHandle, "", results);
    return results;
  }

  private async walk(
    dir: FileSystemDirectoryHandle,
    path: string,
    out: NoteFile[]
  ): Promise<void> {
    for await (const [name, handle] of (dir as any).entries() as AsyncIterable<
      [string, FileSystemHandle]
    >) {
      // Ignore dossiers cachés / techniques
      if (name.startsWith(".")) continue;

      if (handle.kind === "directory") {
        await this.walk(handle as FileSystemDirectoryHandle, `${path}${name}/`, out);
      } else if (name.toLowerCase().endsWith(".md")) {
        const id = name.replace(/\.md$/i, "");
        out.push({
          id,
          fileName: name,
          handle: handle as FileSystemFileHandle,
          path: `${path}${name}`
        });
      }
    }
  }

  /** Lit le contenu texte d'une note. */
  async readNote(note: NoteFile): Promise<string> {
    const file = await note.handle.getFile();
    return await file.text();
  }

  /** Écrit le contenu texte d'une note (sauvegarde). */
  async writeNote(note: NoteFile, content: string): Promise<void> {
    const writable = await (note.handle as any).createWritable();
    await writable.write(content);
    await writable.close();
  }

  /** Crée un nouveau fichier .md à la racine du dossier ouvert. */
  async createNote(title: string): Promise<NoteFile> {
    if (!this.rootHandle) throw new Error("Aucun dossier ouvert");
    const safe = title.trim().replace(/[\\/:*?"<>|]/g, "-") || "Sans titre";
    const fileName = safe.toLowerCase().endsWith(".md") ? safe : `${safe}.md`;
    const handle = await this.rootHandle.getFileHandle(fileName, { create: true });
    const writable = await (handle as any).createWritable();
    await writable.write(`# ${safe}\n\n`);
    await writable.close();
    return {
      id: fileName.replace(/\.md$/i, ""),
      fileName,
      handle,
      path: fileName
    };
  }
}
