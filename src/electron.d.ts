interface ElectronAPI {
  saveDialog(defaultName: string): Promise<string | null>;
  openDialog(): Promise<string | null>;
  writeFile(filePath: string, content: string): Promise<void>;
  readFile(filePath: string): Promise<string>;
  printToPDF(options: object): Promise<Uint8Array>;
  printFromHTML(html: string, options: object): Promise<Uint8Array>;
  onMenuAction(callback: (action: string) => void): void;
  onCloseRequested(callback: () => void): void;
  confirmClose(): void;
  onFileOpen(callback: (filePath: string) => void): void;
  getPendingPath(): Promise<string | null>;
  onUpdateAvailable(callback: (version: string) => void): void;
  onUpdateCheckResult(callback: (result: string) => void): void;

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
}

interface Window {
  electronAPI?: ElectronAPI;
}
