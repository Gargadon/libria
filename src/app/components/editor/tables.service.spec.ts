import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorTableService } from './tables.service';
import { BookStore } from '../../store/book.store';

describe('table edits and pending input', () => {
  let table: HTMLTableElement;
  const updateChapterBlock = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    updateChapterBlock.mockClear();
    TestBed.configureTestingModule({
      providers: [
        EditorTableService,
        {
          provide: BookStore,
          useValue: {
            activeChapter: () => ({ id: 'chapter', body: [{ type: 'table' }] }),
            saveSnapshot: vi.fn(),
            updateChapterBlock,
          },
        },
      ],
    });
    document.body.innerHTML =
      '<table><tbody><tr><td tabindex="0">Uno</td><td>Dos</td></tr></tbody></table>';
    table = document.querySelector('table')!;
    Object.defineProperty(table, 'innerText', { get: () => table.textContent });
    table.rows[0].cells[0].focus();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it('does not overwrite an inserted row with older debounced table HTML', () => {
    const service = TestBed.inject(EditorTableService);
    service.onTableInput('chapter', 0, { target: table } as unknown as Event, false);
    service.tableInsertRowBelow(0);
    vi.advanceTimersByTime(500);
    expect(table.rows).toHaveLength(2);
    expect(updateChapterBlock).toHaveBeenCalledOnce();
    expect(updateChapterBlock.mock.calls[0][3]).toBe(table.outerHTML);
  });

  it('cancels pending table input when its editor scope is destroyed', () => {
    TestBed.inject(EditorTableService).onTableInput(
      'chapter',
      0,
      { target: table } as unknown as Event,
      false,
    );
    TestBed.resetTestingModule();
    vi.advanceTimersByTime(500);
    expect(updateChapterBlock).not.toHaveBeenCalled();
  });
});
