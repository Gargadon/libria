import { Injectable } from '@angular/core';
@Injectable({ providedIn: 'root' })
export class ExportFileService {
  private _saveAs: any;
  async downloadFile(blob: Blob, filename: string) {
    if (window.desktopAPI?.saveExport) {
      await window.desktopAPI.saveExport(filename, new Uint8Array(await blob.arrayBuffer()));
      return;
    }
    if (!this._saveAs) {
      const mod: any = await import('file-saver');
      this._saveAs = mod.saveAs ?? mod.default?.saveAs ?? mod.default;
    }
    this._saveAs(blob, filename);
  }
}
