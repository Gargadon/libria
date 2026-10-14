import { inject, Injectable, DestroyRef } from '@angular/core';
import { BookStore } from '../../store/book.store';

@Injectable()
export class EditorTableService {
  readonly store = inject(BookStore);

  private _tableInputTimeout: any;

  private get focusedTableCell(): HTMLTableCellElement | null {
    const el = document.activeElement;
    return el?.closest('td, th') || null;
  }

  tableInsertRowAbove(index: number) {
    const cell = this.focusedTableCell;
    if (!cell) return;
    const table = cell.closest('table')!;
    const rowIdx = cell.closest('tr')!.rowIndex;
    const row = table.insertRow(rowIdx);
    const cols = table.rows[0]?.cells.length || 1;
    for (let i = 0; i < cols; i++) row.insertCell();
    this.syncTableHtml(table, index);
  }

  tableInsertRowBelow(index: number) {
    const cell = this.focusedTableCell;
    if (!cell) return;
    const table = cell.closest('table')!;
    const row = table.insertRow(cell.closest('tr')!.rowIndex + 1);
    const cols = table.rows[0]?.cells.length || 1;
    for (let i = 0; i < cols; i++) row.insertCell();
    this.syncTableHtml(table, index);
  }

  tableInsertColLeft(index: number) {
    const cell = this.focusedTableCell;
    if (!cell) return;
    const table = cell.closest('table')!;
    const colIdx = cell.cellIndex;
    for (let i = 0; i < table.rows.length; i++) {
      table.rows[i].insertCell(colIdx);
    }
    this.syncTableHtml(table, index);
  }

  tableInsertColRight(index: number) {
    const cell = this.focusedTableCell;
    if (!cell) return;
    const table = cell.closest('table')!;
    const colIdx = cell.cellIndex + 1;
    for (let i = 0; i < table.rows.length; i++) {
      table.rows[i].insertCell(colIdx);
    }
    this.syncTableHtml(table, index);
  }

  tableDeleteRow(index: number) {
    const cell = this.focusedTableCell;
    if (!cell) return;
    const table = cell.closest('table')!;
    const rowIdx = cell.closest('tr')!.rowIndex;
    if (table.rows.length <= 1) return;
    table.deleteRow(rowIdx);
    this.syncTableHtml(table, index);
  }

  tableDeleteCol(index: number) {
    const cell = this.focusedTableCell;
    if (!cell) return;
    const table = cell.closest('table')!;
    const colIdx = cell.cellIndex;
    if (table.rows[0]?.cells.length <= 1) return;
    for (let i = 0; i < table.rows.length; i++) {
      table.rows[i].deleteCell(colIdx);
    }
    this.syncTableHtml(table, index);
  }

  private syncTableHtml(table: HTMLTableElement, index: number) {
    clearTimeout(this._tableInputTimeout);
    const html = table.outerHTML;
    const chapter = this.store.activeChapter();
    if (!chapter) return;
    const idx = index >= 0 ? index : 0;
    if (idx < 0 || idx >= chapter.body.length || chapter.body[idx].type !== 'table') return;
    this.store.saveSnapshot();
    this.store.updateChapterBlock(chapter.id, idx, table.innerText.replace(/\n$/, ''), html);
  }
  onTableInput(chapterId: string, blockIndex: number, event: Event, suppressed: boolean) {
    if (suppressed) return;
    const el = event.target as HTMLTableElement;
    const html = el.outerHTML;
    clearTimeout(this._tableInputTimeout);
    this._tableInputTimeout = setTimeout(() => {
      this.store.updateChapterBlock(chapterId, blockIndex, el.innerText.replace(/\n$/, ''), html);
    }, 500);
  }
  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this._tableInputTimeout));
  }
}
