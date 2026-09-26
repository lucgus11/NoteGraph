// ---------------------------------------------------------------------------
// Déclarations d'appoint pour la File System Access API : lib.dom.d.ts ne
// couvre pas encore intégralement showDirectoryPicker / permissions.
// ---------------------------------------------------------------------------
interface FileSystemHandlePermissionDescriptor {
  mode?: "read" | "readwrite";
}

interface FileSystemHandle {
  queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface Window {
  showDirectoryPicker(options?: { mode?: "read" | "readwrite" }): Promise<FileSystemDirectoryHandle>;
}
