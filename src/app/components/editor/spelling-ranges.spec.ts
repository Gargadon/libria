import { describe, expect, it, vi } from 'vitest';
import { spellingAtPoint, spellingRanges } from './spelling-ranges';

describe('spelling ranges', () => {
  it('finds every misspelling across inline formatting without changing the HTML', () => {
    const element = document.createElement('p');
    element.innerHTML = 'Hola <em>mun</em>doo. mundoo y adiós';
    const html = element.innerHTML;
    const ranges = spellingRanges(element, word => word !== 'mundoo');
    expect(ranges.map(item => item.word)).toEqual(['mundoo', 'mundoo']);
    expect(ranges.map(item => item.range.toString())).toEqual(['mundoo', 'mundoo']);
    expect(element.innerHTML).toBe(html);
  });

  it('keeps list and table boundaries and excludes footnotes and noneditable content', () => {
    const element = document.createElement('div');
    element.innerHTML = '<ul><li>holaa</li><li>mundoo</li></ul><table><tbody><tr><td>otroo</td><td>errorr</td></tr></tbody></table><p>ho<sup data-fn="a">nota</sup>la <span contenteditable="false">excluir</span></p>';
    expect(spellingRanges(element, () => false).map(item => item.word))
      .toEqual(['holaa', 'mundoo', 'otroo', 'errorr', 'ho', 'la']);
  });

  it('opens suggestions only at the exact visible word, including wrapped words', () => {
    const element = document.createElement('p');
    element.textContent = 'mundoo';
    const ranges = spellingRanges(element, () => false);
    ranges[0].range.getClientRects = vi.fn(() => [
      { left: 10, right: 40, top: 10, bottom: 20 }, { left: 0, right: 10, top: 20, bottom: 30 },
    ] as unknown as DOMRectList);
    expect(spellingAtPoint(ranges, 25, 15)?.word).toBe('mundoo');
    expect(spellingAtPoint(ranges, 5, 25)?.word).toBe('mundoo');
    expect(spellingAtPoint(ranges, 50, 15)).toBeUndefined();
  });
});
