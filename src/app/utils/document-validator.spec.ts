import { describe, expect, it } from 'vitest';
import { migrateLibriaDocument, validateLibriaDocument } from './document-validator';
import { blockToHtml, sanitizeRichHtml } from './block-html';
import { Tweaks } from '../models/book.models';

const tweaks = {
  dropCap: true,
  sceneBreakType: 'asterisks3',
} as Tweaks;

describe('document compatibility and rendering safety', () => {
  it('migrates legacy preference names and optional collections', () => {
    const migrated = migrateLibriaDocument({
      libriaVersion: '1.6.2',
      metadata: { title: 'Libro', author: 'Autor', paperSize: '5x8' },
      preferences: { emDash: false, ellipsis: false },
      chapters: [{ id: 'ch-1', title: 'Inicio', body: [] }],
    });

    expect(migrated.preferences.smartDashes).toBe(false);
    expect(migrated.preferences.smartEllipsis).toBe(false);
    expect(migrated.notes).toEqual([]);
    expect(() => validateLibriaDocument(migrated)).not.toThrow();
  });

  it('rejects invalid block payloads', () => {
    expect(() => validateLibriaDocument({
      libriaVersion: '1',
      metadata: { title: 'Libro', author: 'Autor', paperSize: '5x8' },
      preferences: {},
      chapters: [{ id: 'ch-1', title: 'Inicio', body: [{ type: 'p', text: 42 }] }],
    })).toThrow(/texto del bloque/);
  });

  it('sanitizes rich text before export', () => {
    const clean = sanitizeRichHtml('<p>Hola</p><script>alert(1)</script><img src=x onerror=alert(2)>');
    expect(clean).toContain('<p>Hola</p>');
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('onerror');

    const html = blockToHtml({ type: 'p', html: '<strong>Seguro</strong><script>alert(1)</script>' }, {
      tweaks,
      assets: {},
    });
    expect(html).toContain('<strong>Seguro</strong>');
    expect(html).not.toContain('script');
  });

  it('does not export non-raster or malformed image data', () => {
    expect(blockToHtml({ type: 'image', src: 'evil' }, {
      tweaks,
      assets: { evil: 'javascript:alert(1)' },
    })).toBe('');
  });

  it('preserves dedication content in print output', () => {
    const html = blockToHtml({ type: 'dedication', html: '<em>Para mi familia</em>' }, { tweaks, assets: {} });
    expect(html).toContain('<em>Para mi familia</em>');
    expect(html).toContain('kp-ded');
  });
});
