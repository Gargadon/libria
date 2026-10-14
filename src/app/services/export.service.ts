import { Injectable, inject } from '@angular/core';
import { EpubExportService } from './export/epub-export.service';
import { DocxExportService } from './export/docx-export.service';
import { OdtExportService } from './export/odt-export.service';
import { PdfExportService } from './export/pdf-export.service';
import { PrintHtmlService } from './export/print-html.service';

/** Stable entry point for UI actions; each format owns its conversion pipeline. */
@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly epub = inject(EpubExportService);
  private readonly docx = inject(DocxExportService);
  private readonly odt = inject(OdtExportService);
  private readonly pdf = inject(PdfExportService);
  private readonly printHtml = inject(PrintHtmlService);

  exportEpub() {
    return this.epub.exportEpub();
  }
  exportDocx() {
    return this.docx.exportDocx();
  }
  exportOdt() {
    return this.odt.exportOdt();
  }
  exportPdf() {
    return this.pdf.exportPdf();
  }
  buildPrintHtml(...args: Parameters<PrintHtmlService['buildPrintHtml']>) {
    return this.printHtml.buildPrintHtml(...args);
  }
}
