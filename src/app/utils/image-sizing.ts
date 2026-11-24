import { Block } from '../models/book.models';
import { imageTransform } from './block-maps';

/** Fit a new inline image without enlarging it or discarding the source pixels. */
export function inlineImageSize(width: number, height: number) {
  const scale = Math.min(1, 360 / width, 280 / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function imageStyle(block: Block): string {
  const parts = ['max-width:100%;display:block;margin:0 auto', 'height:auto'];
  const width = block.width;
  if (typeof width === 'number' && Number.isFinite(width) && width > 0 && width <= 10000) {
    parts.push(`width:${width}px`);
  }
  const transform = imageTransform(block.rotation, block.flipH, block.flipV);
  if (transform) parts.push(`transform:${transform}`);
  return parts.join(';');
}
