import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BookStore } from '../../store/book.store';

import { AssetService } from '../asset.service';

import { ExportFileService } from './export-file.service';
import { resolveChapters, pageSizeToInches } from './export-utils';
import { PrintHtmlService } from './print-html.service';

@Injectable({ providedIn: 'root' })
export class PdfExportService {
  private readonly store = inject(BookStore);
  private readonly ts = inject(TranslateService);
  private readonly assetService = inject(AssetService);
  private readonly files = inject(ExportFileService);
  private readonly printHtml = inject(PrintHtmlService);

  async exportPdf() {
    this.store.setExporting(true, this.ts.instant('sidebar.exportingPdf'));
    try {
      const book = this.store.book();
      if (!book) return;

      const prefs = this.store.exportPrefs();
      const chapters = resolveChapters(this.store.chapters(), prefs);
      const t = this.store.tweaks();
      const bodyFontFamily = this.store.bookFontFamily();
      const titleFontFamily = this.store.titleFontFamily();

      // Vivliostyle resolves pagination and target-counter() while composing the PDF.
      // Preview measurements are intentionally not used for the final artifact.
      const html = this.printHtml.buildPrintHtml(
        book,
        chapters,
        t,
        bodyFontFamily,
        titleFontFamily,
        undefined,
        this.assetService.getAll(),
      );
      const pageSize = pageSizeToInches(book.paperSize || '5x8');

      const pdfOptions: Record<string, any> = {
        title: book.title,
        author: book.authors?.filter(name => name.trim()).join(', ') || book.author || '',
        pageSize,
        printBackground: true,
        pdfx: t.pdfxCompliant || false,
        margins: {
          marginType: 'custom',
          top: t.marginTop / 25.4,
          bottom: t.marginBottom / 25.4,
          left: 0,
          right: 0,
        },
      };

      // We use CSS @page margin boxes for headers and footers instead of legacy printToPDF templates
      pdfOptions['displayHeaderFooter'] = false;

      const pdfData = await (window as any).desktopAPI.printFromHTML(html, pdfOptions);
      const blob = new Blob([pdfData], { type: 'application/pdf' });
      await this.files.downloadFile(blob, `${book.title}.pdf`);
    } catch (error) {
      console.error('PDF export failed', error);
      if (window.desktopAPI)
        await window.desktopAPI.showError('No se pudo exportar el PDF', String(error));
    } finally {
      this.store.setExporting(false);
    }
  }
}
