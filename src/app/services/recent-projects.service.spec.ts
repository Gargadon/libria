import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecentProjectsService } from './recent-projects.service';

describe('local recent projects', () => {
  afterEach(() => vi.unstubAllGlobals());
  function fixture(items: unknown[] = []) {
    let saved = JSON.stringify(items);
    vi.stubGlobal('localStorage', { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; }, removeItem: () => { saved = '[]'; } });
    return { service: new RecentProjectsService(), stored: () => JSON.parse(saved) };
  }
  it('removes existing Drive cache entries before limiting the list to five local documents', () => {
    const local = Array.from({ length: 8 }, (_, i) => ({ path: `/books/${i}.libria`, title: String(i), date: '' }));
    const f = fixture([{ path: 'C:\\Libria\\drive-cache\\account\\remote.libria' }, { path: '/libria/drive-cache/account/other.libria' }, ...local]);
    expect(f.service.getAll()).toEqual(local.slice(0, 5));
    expect(f.stored()).toEqual(local.slice(0, 5));
  });
  it('does not evict local documents when opening or saving a Drive document', () => {
    const f = fixture();
    for (let i = 0; i < 6; i++) f.service.add(`/books/${i}.libria`, String(i));
    const before = f.service.getAll();
    f.service.add('/books/remote.libria', 'Remote', 'drive');
    f.service.add('C:\\Libria\\drive-cache\\account\\remote.libria', 'Cached');
    expect(f.service.getAll()).toEqual(before);
    expect(before.map(item => item.title)).toEqual(['5', '4', '3', '2', '1']);
  });
});
