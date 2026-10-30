import { describe, expect, it, vi } from 'vitest';
import { ChapterPagination, ChapterSource } from './chapter-pagination';

const source = (id: string, pages: number, forceOddPage = false): ChapterSource => ({
  id,
  forceOddPage,
  html: () => `${id}:${pages}`,
});
const renderer = () =>
  vi.fn(async (html: string, parity: number) =>
    Array.from({ length: Number(html.split(':')[1]) }, (_, index) => ({ html, parity, index })),
  );

describe('incremental chapter pagination', () => {
  it('recomposes only an edited chapter and retains unchanged page objects', async () => {
    const cache = new ChapterPagination<object>();
    const render = renderer();
    const first = await cache.compose([source('a', 2), source('b', 2), source('c', 1)], render);
    const repeat = await cache.compose([source('a', 2), source('b', 2), source('c', 1)], render);
    expect(repeat.rendered).toBe(0);
    expect(repeat.reused).toBe(3);
    expect(repeat.chapters[2].pages).toBe(first.chapters[2].pages);
    const changed = await cache.compose([source('a', 4), source('b', 2), source('c', 1)], render);
    expect(changed.rendered).toBe(1);
    expect(changed.chapters.map((chapter) => chapter.startPage)).toEqual([1, 5, 7]);
    expect(changed.chapters[1].pages).toBe(first.chapters[1].pages);
    expect(changed.total).toBe(7);
  });

  it('caches both starting parities when an earlier chapter gains a page', async () => {
    const cache = new ChapterPagination<object>();
    const render = renderer();
    const original = await cache.compose([source('a', 1), source('b', 2)], render);
    const shifted = await cache.compose([source('a', 2), source('b', 2)], render);
    expect(shifted.rendered).toBe(2);
    expect(shifted.chapters[1].startPage).toBe(3);
    const restored = await cache.compose([source('a', 1), source('b', 2)], render);
    expect(restored.rendered).toBe(1);
    expect(restored.chapters[1].pages).toBe(original.chapters[1].pages);
  });

  it('adds or removes a blank before a recto chapter without recomposing that chapter', async () => {
    const cache = new ChapterPagination<object>();
    const render = renderer();
    const first = await cache.compose(
      [source('a', 1), source('b', 2, true), source('c', 1)],
      render,
    );
    expect(first.chapters[1]).toMatchObject({ startPage: 3, hasBlankBefore: true });
    const changed = await cache.compose(
      [source('a', 2), source('b', 2, true), source('c', 1)],
      render,
    );
    expect(changed.rendered).toBe(1);
    expect(changed.chapters[1]).toMatchObject({ startPage: 3, hasBlankBefore: false });
    expect(changed.chapters[1].pages).toBe(first.chapters[1].pages);
    expect(changed.total).toBe(first.total);
  });

  it('resolves contents against actual chapter lengths, including contents growth', async () => {
    const cache = new ChapterPagination<object>();
    const render = vi.fn(async (html: string) => {
      const pages = html.startsWith('toc:')
        ? Number(html.split(':')[1]) >= 10
          ? 2
          : 1
        : Number(html.split(':')[1]);
      return Array.from({ length: pages }, () => ({ html }));
    });
    const toc: ChapterSource = {
      id: 'toc',
      isContents: true,
      html: (starts) => `toc:${starts['body']}`,
    };
    const result = await cache.compose([source('cover', 8), toc, source('body', 3)], render);
    expect(result.chapters.map((chapter) => chapter.startPage)).toEqual([1, 9, 11]);
    expect(result.chapters[1].pages).toHaveLength(2);
    expect(result.chapters[1].pages[0]).toEqual({ html: 'toc:11' });
    expect(result.total).toBe(13);
  });

  it('invalidates chapters when their effective HTML changes and evicts removed chapters', async () => {
    const cache = new ChapterPagination<object>();
    const render = renderer();
    await cache.compose([source('a', 1), source('b', 2)], render);
    await cache.compose([source('a', 1)], render);
    const restored = await cache.compose([source('a', 1), source('b', 2)], render);
    expect(restored.rendered).toBe(1);
    const stylesChanged = await cache.compose(
      [
        { ...source('a', 1), html: () => 'a:1:new-font' },
        { ...source('b', 2), html: () => 'b:2:new-font' },
      ],
      render,
    );
    expect(stylesChanged.rendered).toBe(2);
  });

  it('does not commit a superseded composition', async () => {
    const cache = new ChapterPagination<object>();
    let current = true;
    await expect(
      cache.compose(
        [source('a', 1), source('b', 1)],
        async () => {
          current = false;
          return [{}];
        },
        () => current,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    const render = renderer();
    const result = await cache.compose([source('a', 1), source('b', 1)], render);
    expect(result.rendered).toBe(2);
  });

  it('bounds cyclic contents layouts so the caller can use whole-book composition', async () => {
    const cache = new ChapterPagination<object>();
    const toc: ChapterSource = {
      id: 'toc',
      isContents: true,
      html: (starts) => `toc:${starts['body']}`,
    };
    await expect(
      cache.compose([toc, source('body', 1)], async (html) => {
        const count = html.startsWith('toc:') && html === 'toc:2' ? 2 : 1;
        return Array.from({ length: count }, () => ({}));
      }),
    ).rejects.toThrow('Contents pagination did not converge');
  });
});
