interface ElectronAPI {
  saveDialog(defaultName: string): Promise<string | null>;
  openDialog(): Promise<string | null>;
  writeFile(filePath: string, content: string): Promise<void>;
  readFile(filePath: string): Promise<string>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
