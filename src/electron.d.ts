interface ElectronAPI {
  saveDialog(defaultName: string): Promise<string | null>;
  openDialog(): Promise<string | null>;
  writeFile(filePath: string, content: string): Promise<void>;
  readFile(filePath: string): Promise<string>;
  printToPDF(options: object): Promise<Uint8Array>;
  onMenuAction(callback: (action: string) => void): void;
  onCloseRequested(callback: () => void): void;
  confirmClose(): void;
  onFileOpen(callback: (filePath: string) => void): void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
