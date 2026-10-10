interface DesktopAPI {
  driveStatus(): Promise<DriveStatus>;
  driveConnect(): Promise<DriveStatus>;
  driveDisconnect(): Promise<{ revoked: boolean }>;
  driveListFiles(cursor?: string): Promise<{ files: DriveFile[]; nextPageToken: string | null }>;
  driveReadFile(id: string, forceRemote?: boolean): Promise<DriveDocument>;
  driveFileMetadata(id: string): Promise<DriveFile & { version: string }>;
  driveWriteFile(id: string, version: string, content: string, account: string): Promise<Partial<DriveLink> & { conflict: boolean }>;
  driveCreateFile(name: string, content: string): Promise<DriveLink>;
  driveCacheFile(link: DriveLink, content: string): Promise<string>;
  driveCachedLink(path: string): Promise<DriveLink | null>;
  driveCancel(): Promise<void>;
  saveDialog(defaultName: string, kind?: 'document' | 'theme'): Promise<string | null>;
  openDialog(kind?: 'document' | 'theme'): Promise<string | null>;
  writeFile(filePath: string, content: string): Promise<void>;
  readFile(filePath: string): Promise<string>;
  getFontsCss(): Promise<string>;
  getSystemFonts(): Promise<string[]>;
  getFontVariants(family: string): Promise<{ data: string; mimeType: string; style: string; weight: string }[]>;
  showError(title: string, content: string): Promise<void>;
  printFromHTML(html: string, options: object): Promise<Uint8Array>;
  saveExport(filename: string, bytes: Uint8Array): Promise<boolean>;
  onMenuAction(callback: (action: string) => void): void;
  onCloseRequested(callback: () => void): void;
  confirmClose(): void;
  onFileOpen(callback: (filePath: string) => void): void;
  getPendingPath(): Promise<string | null>;
  onUpdateAvailable(callback: (update: { version: string; url?: string }) => void): void;
  onUpdateCheckResult(callback: (result: string) => void): void;
  setLanguage(lang: string): void;

  platform: string;
  arch: string;
  useIntegratedMenu?: boolean;

  // Spell checker
  setSpellCheckerLanguage(lang: string): Promise<void>;
  getCustomDictionary(): Promise<string[]>;
  addWordToDictionary(word: string): Promise<boolean>;
  removeWordFromDictionary(word: string): Promise<boolean>;

  // Auto-updater
  checkForUpdates(): void;
  openExternal(url: string): Promise<void>;
}

interface Window {
  desktopAPI?: DesktopAPI;
}

interface DriveStatus {
  writable?: boolean;
  configured: boolean;
  connected: boolean;
  account: { name: string; email: string } | null;
}
interface DriveLink { id: string; name: string; version: string; account: string; baseline?: string; }
interface DriveDocument extends DriveLink { content: string; }
interface DriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
  size?: string;
  capabilities?: { canDownload?: boolean };
}
