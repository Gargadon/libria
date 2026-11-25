import { describe, expect, it } from 'vitest';
import { imageStyle, inlineImageSize } from './image-sizing';

describe('inline image sizing', () => {
  it.each([
    [2400, 800, 360, 120],
    [800, 3200, 70, 280],
    [160, 60, 160, 60],
  ])('fits %i × %i to %i × %i without enlarging or stretching', (width, height, fittedWidth, fittedHeight) => {
    expect(inlineImageSize(width, height)).toEqual({ width: fittedWidth, height: fittedHeight });
  });

  it('lets the browser keep the intrinsic ratio even when a saved image exceeds the column', () => {
    const style = imageStyle({ type: 'image', width: 1800, height: 700 });
    expect(style).toContain('max-width:100%');
    expect(style).toContain('height:auto');
    expect(style).toContain('width:1800px');
    expect(style).not.toContain('height:700px');
  });
});
