import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleDriveModalComponent } from './google-drive-modal.component';
import { GoogleDriveService } from '../../services/google-drive.service';
import { FileService } from '../../services/file.service';

describe('Drive destination picker', () => {
  afterEach(() => { TestBed.resetTestingModule(); delete window.desktopAPI; });

  it('shows synchronization first for a linked document instead of asking to create a copy', async () => {
    const sync = vi.fn().mockResolvedValue(undefined);
    const status = { configured: true, connected: true, writable: true, account: { name: 'Writer', email: 'writer@example.com' } };
    window.desktopAPI = { driveStatus: vi.fn().mockResolvedValue(status), driveListFiles: vi.fn().mockResolvedValue({ files: [], nextPageToken: null }) } as unknown as DesktopAPI;
    await TestBed.configureTestingModule({
      imports: [GoogleDriveModalComponent, TranslateModule.forRoot()],
      providers: [{ provide: FileService, useValue: {
        store: { book: () => ({ title: 'Novel' }) }, syncState: () => 'pending', syncError: () => '', autoSync: () => true,
        driveLink: () => ({ id: 'novel', name: 'Novel.libria', account: status.account.email, version: '1' }), syncDrive: sync,
      } }],
    }).compileComponents();
    const drive = TestBed.inject(GoogleDriveService);
    await drive.show();
    const fixture = TestBed.createComponent(GoogleDriveModalComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.sync-card')).not.toBeNull();
    expect(root.querySelector('.save-destination')).toBeNull();
    root.querySelector<HTMLButtonElement>('.sync-card button.primary')!.click();
    await fixture.whenStable();
    expect(sync).toHaveBeenCalledOnce();
  });

  it('requires confirmation to trash a document and allows cancelling', async () => {
    const trash = vi.fn().mockResolvedValue({ id: 'novel', trashed: true });
    window.desktopAPI = { driveStatus: vi.fn(), driveTrashFile: trash } as unknown as DesktopAPI;
    await TestBed.configureTestingModule({
      imports: [GoogleDriveModalComponent, TranslateModule.forRoot()],
      providers: [{ provide: FileService, useValue: {
        store: { book: () => null }, syncState: () => 'idle', driveLink: () => null,
      } }],
    }).compileComponents();
    const drive = TestBed.inject(GoogleDriveService);
    drive.status.set({ configured: true, connected: true, writable: true, account: { name: 'Writer', email: 'writer@example.com' } });
    drive.files.set([{ id: 'novel', name: 'Novel.libria', capabilities: { canTrash: true } }]);
    const fixture = TestBed.createComponent(GoogleDriveModalComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.trash-button')!.click();
    await fixture.whenStable();
    expect(root.querySelector('.decision-card')?.textContent).toContain('Novel.libria');
    expect(root.querySelector('.decision-card')?.textContent).toContain('writer@example.com');
    expect(trash).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>('[data-trash-cancel]')!.click();
    await fixture.whenStable();
    expect(trash).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>('.trash-button')!.click();
    await fixture.whenStable();
    root.querySelector<HTMLButtonElement>('.danger-button')!.click();
    await fixture.whenStable();
    expect(trash).toHaveBeenCalledWith('novel', 'writer@example.com');
    expect(root.querySelector('.trash-button')).toBeNull();
  });

  it('selects a destination through Google Picker and saves with the chosen name', async () => {
    const folder = { id: 'novels', name: 'Novels', mimeType: 'application/vnd.google-apps.folder' };
    const list = vi.fn().mockResolvedValue({ files: [], nextPageToken: null });
    const upload = vi.fn().mockResolvedValue(undefined);
    const status = { configured: true, connected: true, writable: true, account: null };
    const pick = vi.fn().mockResolvedValue(folder);
    window.desktopAPI = { driveStatus: vi.fn().mockResolvedValue(status), driveListFiles: list, drivePickFile: pick } as unknown as DesktopAPI;
    await TestBed.configureTestingModule({
      imports: [GoogleDriveModalComponent, TranslateModule.forRoot()],
      providers: [{ provide: FileService, useValue: {
        store: { book: () => ({ title: 'Novel' }) }, syncState: () => 'idle', syncError: () => '', driveLink: () => null, uploadDriveCopy: upload,
      } }],
    }).compileComponents();
    const drive = TestBed.inject(GoogleDriveService);
    drive.status.set({ configured: true, connected: true, writable: true, account: null });
    drive.mode.set('save');
    drive.filename.set('Novel.libria');
    drive.files.set([folder]);
    const fixture = TestBed.createComponent(GoogleDriveModalComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.folder-path button')!.click();
    await fixture.whenStable();
    expect(pick).toHaveBeenCalledWith('folder');
    expect(list).not.toHaveBeenCalled();
    expect(root.querySelector('.folder-path')?.textContent).toContain('Novels');
    const input = root.querySelector<HTMLInputElement>('#drive-filename')!;
    input.value = 'My novel';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.save-destination .primary')!.click();
    await fixture.whenStable();
    expect(upload).toHaveBeenCalledWith('novels', 'My novel.libria');
    expect(root.querySelector('.save-destination')).toBeNull();
  });
});
