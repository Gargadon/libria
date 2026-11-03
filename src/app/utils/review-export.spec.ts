import { describe, expect, it } from 'vitest';
import { Chapter, ReviewState } from '../models/book.models';
import { withReviewMarks } from './review-changes';
import { DocxBlockRenderer } from '../services/export/docx-block-renderer';

const chapter = (body: Chapter['body']): Chapter => ({
  id: 'ch-1',
  kind: 'chapter',
  title: 'Capítulo',
  words: 0,
  body,
});

const review = (baseline: Chapter[]): ReviewState => ({
  mode: 'track',
  round: {
    id: 'rev-1',
    author: 'Ana',
    role: 'corrector',
    startedAt: '2026-11-01T00:00:00.000Z',
    baselineRevision: 1,
    schemaVersion: 2,
  },
  baseline,
});

describe('exportación con marcas de revisión', () => {
  it('marca el texto corregido y conserva el formato', () => {
    const live = [chapter([{ id: 'a', type: 'p', text: 'Hola mundo', html: '<b>Hola</b> mundo' }])];
    const accepted = [chapter([{ id: 'a', type: 'p', text: 'Hola cruel', html: '<b>Hola</b> cruel' }])];

    const [marked] = withReviewMarks(live, review(accepted));
    const html = marked.body[0].html ?? '';

    expect(html).toContain('rev-del');
    expect(html).toContain('rev-ins');
    expect(html).toContain('<b>');
    expect(marked.body[0].text).toBe('Hola mundo');
  });

  it('reinserta los párrafos eliminados marcados como suprimidos', () => {
    const live = [chapter([{ id: 'a', type: 'p', text: 'Uno' }, { id: 'c', type: 'p', text: 'Tres' }])];
    const accepted = [chapter([
      { id: 'a', type: 'p', text: 'Uno' },
      { id: 'b', type: 'p', text: 'Dos' },
      { id: 'c', type: 'p', text: 'Tres' },
    ])];

    const [marked] = withReviewMarks(live, review(accepted));

    expect(marked.body.map((block) => block.text)).toEqual(['Uno', 'Dos', 'Tres']);
    expect(marked.body[1].html).toContain('rev-del');
    expect(marked.body[1].html).toContain('Dos');
  });

  it('marca un párrafo nuevo completo', () => {
    const live = [chapter([{ id: 'a', type: 'p', text: 'Uno' }, { id: 'b', type: 'p', text: 'Nuevo' }])];
    const accepted = [chapter([{ id: 'a', type: 'p', text: 'Uno' }])];

    const [marked] = withReviewMarks(live, review(accepted));

    expect(marked.body[1].html).toContain('rev-ins');
    expect(marked.body[1].html).toContain('Nuevo');
  });

  it('devuelve los capítulos intactos sin ronda abierta', () => {
    const live = [chapter([{ id: 'a', type: 'p', text: 'Hola', html: 'Hola' }])];

    expect(withReviewMarks(live, null)).toBe(live);
    expect(withReviewMarks(live, { mode: 'off', round: null, baseline: null })).toBe(live);
  });

  it('genera revisiones nativas de DOCX con autor y fecha', async () => {
    const docx = await import('docx');
    const renderer = new DocxBlockRenderer(docx, { author: 'Ana', date: '2026-11-01T00:00:00.000Z' });

    const runs = renderer.htmlToTextRuns(
      { html: 'Hola <del>mal</del><ins>bien</ins>', text: 'Hola bien' },
      { font: 'Lora', size: 24 },
    );

    expect(runs.map((run) => run.constructor.name)).toEqual([
      'TextRun',
      'DeletedTextRun',
      'InsertedTextRun',
    ]);
  });

  it('sin contexto de revisión exporta texto normal', async () => {
    const docx = await import('docx');
    const renderer = new DocxBlockRenderer(docx);

    const runs = renderer.htmlToTextRuns(
      { html: 'Hola <del>mal</del><ins>bien</ins>', text: 'Hola bien' },
      { font: 'Lora', size: 24 },
    );

    expect(runs.every((run) => run.constructor.name === 'TextRun')).toBe(true);
  });
});
