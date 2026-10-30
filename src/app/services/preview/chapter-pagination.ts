export interface ChapterSource {
  id: string;
  forceOddPage?: boolean;
  isContents?: boolean;
  html: (starts: Record<string, number>) => string;
}

export interface ChapterPlacement<T> {
  id: string;
  startPage: number;
  pages: T[];
  hasBlankBefore: boolean;
}

export interface ChapterPaginationResult<T> {
  chapters: ChapterPlacement<T>[];
  total: number;
  rendered: number;
  reused: number;
}

/** Cache immutable chapter pages in both starting parities. Absolute folios
 * are applied to a display copy, so moving a chapter by two pages is free. */
export class ChapterPagination<T> {
  private readonly cache = new Map<string, { html: string; variants: Map<number, T[]> }>();
  private readonly counts = new Map<string, number>();

  clear() {
    this.cache.clear();
    this.counts.clear();
  }

  async compose(
    sources: ChapterSource[],
    render: (html: string, parity: number) => Promise<T[]>,
    current: () => boolean = () => true,
  ): Promise<ChapterPaginationResult<T>> {
    const live = new Set(sources.map((source) => source.id));
    for (const id of this.cache.keys())
      if (!live.has(id)) {
        this.cache.delete(id);
        this.counts.delete(id);
      }
    let rendered = 0;
    let reused = 0;
    const check = () => {
      if (!current()) throw new DOMException('Superseded composition', 'AbortError');
    };
    const starts = () => {
      let next = 1;
      const map: Record<string, number> = {};
      for (const source of sources) {
        if (source.forceOddPage && next % 2 === 0) next++;
        map[source.id] = next;
        next += this.counts.get(source.id) ?? 1;
      }
      return map;
    };
    // A contents page can change length when its target folios change. Iterate
    // to a fixed point rather than publishing estimates as final pagination.
    for (let pass = 0; pass < 8; pass++) {
      check();
      let next = 1;
      const chapters: ChapterPlacement<T>[] = [];
      const contentsSources = new Map<string, string>();
      for (const source of sources) {
        check();
        const blank = !!source.forceOddPage && next % 2 === 0;
        if (blank) next++;
        const html = source.html(starts());
        if (source.isContents) contentsSources.set(source.id, html);
        let entry = this.cache.get(source.id);
        if (!entry || entry.html !== html) {
          entry = { html, variants: new Map() };
          this.cache.set(source.id, entry);
        }
        const parity = next % 2 === 0 ? 2 : 1;
        let pages = entry.variants.get(parity);
        if (!pages) {
          pages = await render(html, parity);
          check();
          if (!pages.length) throw new Error('Vivliostyle produced an empty chapter');
          entry.variants.set(parity, pages);
          rendered++;
        } else reused++;
        this.counts.set(source.id, pages.length);
        chapters.push({ id: source.id, startPage: next, pages, hasBlankBefore: blank });
        next += pages.length;
      }
      const finalStarts = starts();
      if (
        sources.every(
          (source) =>
            !source.isContents || contentsSources.get(source.id) === source.html(finalStarts),
        )
      ) {
        return { chapters, total: next - 1, rendered, reused };
      }
    }
    throw new Error('Contents pagination did not converge');
  }
}
