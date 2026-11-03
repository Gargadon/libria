import { describe, expect, it } from 'vitest';
import {
  acceptMarkedHtml,
  diffWords,
  hasMarks,
  markWholeBlock,
  rejectMarkedHtml,
  renderReviewHtml,
  reviewText,
} from './review-marks';
import { sanitizeRichHtml } from './block-html';

const roundTrip = (html: string | undefined, before: string, after: string) => {
  const rendered = renderReviewHtml(html, before, after);
  return { rendered, accepted: acceptMarkedHtml(rendered), rejected: rejectMarkedHtml(rendered) };
};

describe('motor de marcas de revisión', () => {
  it('agrupa los cambios por palabra', () => {
    expect(diffWords('Hola mundo cruel', 'Hola mundo bello')).toEqual([
      { op: 'equal', text: 'Hola mundo ' },
      { op: 'delete', text: 'cruel' },
      { op: 'insert', text: 'bello' },
    ]);
    expect(diffWords('igual', 'igual')).toEqual([{ op: 'equal', text: 'igual' }]);
    expect(diffWords('', 'nuevo')).toEqual([{ op: 'insert', text: 'nuevo' }]);
  });

  it('acepta y rechaza conservando el formato existente', () => {
    const html = '<b>Hola</b> <i>mundo</i> cruel';
    const { rendered, accepted, rejected } = roundTrip(html, 'Hola mundo cruel', 'Hola mundo bello');

    expect(rendered).toContain('rev-del');
    expect(rendered).toContain('cruel');
    expect(rendered).toContain('rev-ins');
    expect(accepted).toBe('<b>Hola</b> <i>mundo</i> bello');
    expect(rejected).toBe('<b>Hola</b> <i>mundo</i> cruel');
  });

  it('marca inserciones en el límite entre dos nodos de texto', () => {
    const html = '<b>Hola </b><i>mundo</i>';
    const { rendered, accepted, rejected } = roundTrip(html, 'Hola mundo', 'Hola gran mundo');

    expect(rendered).toContain('rev-ins');
    expect(reviewText(accepted)).toBe('Hola gran mundo');
    expect(reviewText(rejected)).toBe('Hola mundo');
    expect(accepted).toContain('<b>Hola </b>');
  });

  it('trata una palabra unida como reemplazo y conserva la ida y vuelta', () => {
    const html = '<b>Unodos</b>';
    const { accepted, rejected } = roundTrip(html, 'Unodos', 'Uno dos');

    expect(reviewText(accepted)).toBe('Uno dos');
    expect(reviewText(rejected)).toBe('Unodos');
  });

  it('respeta entidades y comillas tipográficas', () => {
    const html = '<span>Pan &amp; vino «cita»</span>';
    const { accepted, rejected } = roundTrip(html, 'Pan & vino «cita»', 'Pan y vino «cita»');

    expect(reviewText(accepted)).toBe('Pan y vino «cita»');
    expect(reviewText(rejected)).toBe('Pan & vino «cita»');
    expect(rejected).toContain('&amp;');
  });

  it('no corta emojis al marcar por unidades de código', () => {
    const before = 'Hola 😀 mundo';
    const after = 'Hola 😀 mundo feliz';
    const { rendered, accepted, rejected } = roundTrip(undefined, before, after);

    expect(rendered).toContain('rev-ins');
    expect(accepted).toBe(after);
    expect(rejected).toBe(before);
    expect([...accepted]).toContain('😀');
  });

  it('marca bloques completos insertados y suprimidos', () => {
    const deleted = markWholeBlock('<b>Párrafo</b> viejo', 'Párrafo viejo', 'del');
    const inserted = markWholeBlock(undefined, 'Párrafo nuevo', 'ins');

    expect(acceptMarkedHtml(deleted)).toBe('<b></b>');
    expect(reviewText(rejectedOrSelf(deleted))).toBe('Párrafo viejo');
    expect(reviewText(acceptMarkedHtml(inserted))).toBe('Párrafo nuevo');
    expect(rejectMarkedHtml(inserted)).toBe('');
  });

  it('detecta si un HTML ya trae marcas', () => {
    expect(hasMarks('<p>hola</p>')).toBe(false);
    expect(hasMarks('<p>a <ins>b</ins></p>')).toBe(true);
    expect(hasMarks(undefined)).toBe(false);
  });

  it('conserva ins y del al sanear el HTML enriquecido', () => {
    const clean = sanitizeRichHtml('<p>Hola <del class="rev-del">mal</del><ins class="rev-ins">bien</ins></p>');
    expect(clean).toContain('<del class="rev-del">mal</del>');
    expect(clean).toContain('<ins class="rev-ins">bien</ins>');
  });

  it('procesa un bloque largo sin bloquearse', () => {
    const before = Array.from({ length: 6000 }, (_, index) => `palabra${index}`).join(' ');
    const after = before.replace('palabra3000', 'cambiada');
    const started = Date.now();
    const { accepted, rejected } = roundTrip(undefined, before, after);
    const elapsed = Date.now() - started;

    expect(accepted).toBe(after);
    expect(rejected).toBe(before);
    expect(elapsed).toBeLessThan(4000);
  });
});

/** Texto visible del caso "rechazar" sobre un html ya marcado como suprimido. */
function rejectedOrSelf(html: string): string {
  return rejectMarkedHtml(html);
}
