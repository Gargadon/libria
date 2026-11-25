import { Book, Chapter, ChapterHeadingImage } from '../models/book.models';

export const chapterHeadingImageCss = 'display:block;margin:0 auto 1em;max-width:100%;height:auto;break-inside:avoid;break-after:avoid';

export function resolveChapterHeadingImage(
  book: Book | null,
  chapter: Chapter,
  assets: Record<string, string>,
): (ChapterHeadingImage & { src: string }) | undefined {
  if (chapter.kind !== 'chapter' || chapter.templateId === 'toc') return;
  const image = chapter.headingImage === undefined ? book?.headingImage : chapter.headingImage;
  if (!image || !/^heading-[a-z0-9-]+$/i.test(image.assetId)) return;
  if (![image.width, image.height].every(size => Number.isInteger(size) && size > 0 && size <= 360)) return;
  const src = assets[image.assetId];
  return src && /^data:image\/(?:png|jpeg);base64,/i.test(src) ? { ...image, src } : undefined;
}
