import { Injectable, OnDestroy, signal } from '@angular/core';

export interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

@Injectable()
export class DictationService implements OnDestroy {
  readonly state = signal<'idle' | 'starting' | 'loading' | 'listening' | 'stopping'>('idle');
  readonly message = signal('');
  readonly interim = signal('');
  private nativeSession: string | null = null;
  private recognition: Recognition | null = null;

  get local(): boolean { return !!window.desktopAPI?.dictationStart; }

  get supported(): boolean {
    if (this.local) return true;
    const host = window as SpeechWindow;
    return !!(host.SpeechRecognition || host.webkitSpeechRecognition);
  }

  start(lang: string, insert: (text: string) => void): void {
    if (this.recognition || this.nativeSession) return;
    if (this.local) { this.startLocal(lang, insert); return; }
    const host = window as SpeechWindow;
    const Constructor = host.SpeechRecognition || host.webkitSpeechRecognition;
    this.message.set('');
    if (!Constructor) {
      this.message.set('dictation.unsupported');
      return;
    }
    try {
      const recognition = new Constructor();
      this.recognition = recognition;
      this.state.set('starting');
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;
      const committed = new Set<number>();
      recognition.onstart = () => {
        if (this.recognition === recognition && this.state() === 'starting') this.state.set('listening');
      };
      recognition.onresult = event => {
        if (this.recognition !== recognition) return;
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal && !committed.has(i)) {
            committed.add(i);
            const text = result[0].transcript.trim();
            if (text) insert(text);
            if (this.recognition !== recognition) return;
          } else if (!result.isFinal) interim += result[0].transcript;
        }
        this.interim.set(interim);
      };
      recognition.onerror = event => {
        if (this.recognition !== recognition) return;
        const errors: Record<string, string> = {
          'not-allowed': 'permission', 'service-not-allowed': 'unavailable',
          'audio-capture': 'microphone', network: 'network', 'no-speech': 'noSpeech',
          'language-not-supported': 'language',
        };
        if (event.error !== 'aborted') this.message.set(`dictation.${errors[event.error] || 'failed'}`);
        this.abort();
      };
      recognition.onend = () => {
        if (this.recognition !== recognition) return;
        this.recognition = null;
        this.state.set('idle');
        this.interim.set('');
      };
      recognition.start();
    } catch {
      this.message.set('dictation.failed');
      this.abort();
    }
  }

  private startLocal(lang: string, insert: (text: string) => void): void {
    const api = window.desktopAPI!;
    const id = crypto.randomUUID();
    this.nativeSession = id;
    this.state.set('starting');
    this.message.set('');
    this.interim.set('');
    void api.dictationStart(id, lang, event => {
      if (this.nativeSession !== id) return;
      switch (event.type) {
        case 'loading': this.state.set('loading'); break;
        case 'listening': this.state.set('listening'); break;
        case 'partial': this.interim.set(event.text ?? ''); break;
        case 'final':
          this.interim.set('');
          if (event.text?.trim()) insert(event.text.trim());
          break;
        case 'error':
          this.localError(event.code);
          this.endLocal(id);
          break;
        case 'ended': this.endLocal(id); break;
      }
    }).catch(error => {
      if (this.nativeSession !== id) return;
      this.localError(String(error));
      this.endLocal(id);
    });
  }

  private localError(code?: string): void {
    const known = ['language', 'platform', 'busy',
      'runtime', 'model', 'microphone', 'overloaded', 'resources'];
    this.message.set(`dictation.${code && known.includes(code) ? code : 'failed'}`);
  }

  private endLocal(id: string): void {
    if (this.nativeSession !== id) return;
    this.nativeSession = null;
    this.state.set('idle');
    this.interim.set('');
  }

  stop(): void {
    if (this.nativeSession) {
      if (this.state() === 'stopping') return;
      if (this.state() !== 'listening') { this.abort(); return; }
      const id = this.nativeSession;
      this.state.set('stopping');
      void window.desktopAPI!.dictationStop(id, false).catch(() => {
        if (this.nativeSession !== id) return;
        this.message.set('dictation.failed');
        this.abort();
      });
      return;
    }
    if (!this.recognition || this.state() === 'stopping') return;
    if (this.state() === 'starting') { this.abort(); return; }
    this.state.set('stopping');
    try { this.recognition.stop(); } catch { this.abort(); }
  }

  abort(): void {
    const id = this.nativeSession;
    this.nativeSession = null;
    if (id) void window.desktopAPI!.dictationStop(id, true).catch(() => {});
    const recognition = this.recognition;
    this.recognition = null;
    this.state.set('idle');
    this.interim.set('');
    if (recognition) {
      recognition.onstart = recognition.onend = recognition.onerror = recognition.onresult = null;
      try { recognition.abort(); } catch { /* Already ended. */ }
    }
  }

  ngOnDestroy(): void { this.abort(); }
}
