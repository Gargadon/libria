import { afterEach, describe, expect, it, vi } from 'vitest';
import { FontService } from './font.service';

describe('native system fonts', () => {
  afterEach(() => { delete window.desktopAPI; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('lists fonts and reads export data without requesting browser permission', async () => {
    const queryLocalFonts = vi.fn(() => { throw new Error('Browser permission requested'); });
    vi.stubGlobal('queryLocalFonts', queryLocalFonts);
    const getSystemFonts = vi.fn().mockResolvedValue(['Zulu', 'Arial']);
    window.desktopAPI = {
      getSystemFonts,
      getFontVariants: vi.fn().mockResolvedValue([
        { data: btoa('\x00\x01\x00\x00'), mimeType: 'font/ttf', style: 'italic', weight: '600' },
      ]),
    } as unknown as DesktopAPI;
    const service = new FontService();
    expect(await service.loadSystemFonts()).toEqual(['Arial', 'Zulu']);
    await service.loadSystemFonts();
    expect(getSystemFonts).toHaveBeenCalledOnce();
    const [variant] = await service.getFontVariants('Arial');
    expect([...new Uint8Array(variant.buffer)]).toEqual([0, 1, 0, 0]);
    expect(variant).toMatchObject({ mimeType: 'font/ttf', style: 'italic', weight: '600' });
    expect(queryLocalFonts).not.toHaveBeenCalled();
  });

  it('never falls back to browser permission when native enumeration fails', async () => {
    const queryLocalFonts = vi.fn();
    vi.stubGlobal('queryLocalFonts', queryLocalFonts);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.desktopAPI = { getSystemFonts: vi.fn().mockRejectedValue(new Error('Unavailable')) } as unknown as DesktopAPI;
    expect(await new FontService().loadSystemFonts()).toEqual([]);
    expect(queryLocalFonts).not.toHaveBeenCalled();
  });
});
