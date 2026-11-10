import { afterEach, describe, expect, it, vi } from 'vitest';
import { DictationService, Recognition, RecognitionResultEvent } from './dictation.service';

class FakeRecognition implements Recognition {
  static latest: FakeRecognition;
  lang = '';
  continuous = false;
  interimResults = false;
  onstart: Recognition['onstart'] = null;
  onend: Recognition['onend'] = null;
  onerror: Recognition['onerror'] = null;
  onresult: Recognition['onresult'] = null;
  start = vi.fn(() => this.onstart?.());
  stop = vi.fn();
  abort = vi.fn();
  constructor() { FakeRecognition.latest = this; }
}
function result(text: string, isFinal = true): RecognitionResultEvent {
  return { resultIndex: 0, results: [{ isFinal, 0: { transcript: text } }] };
}

describe('voice dictation', () => {
  let service: DictationService;
  afterEach(() => { service?.ngOnDestroy(); vi.unstubAllGlobals(); });
  function setup(prefixed = false) {
    vi.stubGlobal('SpeechRecognition', prefixed ? undefined : FakeRecognition);
    vi.stubGlobal('webkitSpeechRecognition', prefixed ? FakeRecognition : undefined);
    service = new DictationService();
    const insert = vi.fn();
    service.start('es-MX', insert);
    return { recognition: FakeRecognition.latest, insert };
  }
  it('supports the prefixed API and uses the book language', () => {
    const { recognition } = setup(true);
    expect(recognition.lang).toBe('es-MX');
    expect(recognition.continuous).toBe(true);
    expect(service.state()).toBe('listening');
  });
  it('previews interim speech without inserting it and commits a result only once', () => {
    const { recognition, insert } = setup();
    recognition.onresult?.(result('Hola', false));
    expect(service.interim()).toBe('Hola');
    expect(insert).not.toHaveBeenCalled();
    recognition.onresult?.(result('Hola mundo'));
    recognition.onresult?.(result('Hola mundo'));
    expect(insert).toHaveBeenCalledExactlyOnceWith('Hola mundo');
    expect(service.interim()).toBe('');
  });
  it('accepts the final phrase after stop, then returns to idle', () => {
    const { recognition, insert } = setup();
    service.stop();
    expect(service.state()).toBe('stopping');
    recognition.onresult?.(result('Última frase'));
    recognition.onend?.();
    expect(insert).toHaveBeenCalledWith('Última frase');
    expect(service.state()).toBe('idle');
  });
  it('ignores late results after abort or a new session', () => {
    const { recognition, insert } = setup();
    const lateResult = recognition.onresult;
    service.abort();
    service.start('en-US', insert);
    lateResult?.(result('Texto antiguo'));
    expect(insert).not.toHaveBeenCalled();
    expect(recognition.abort).toHaveBeenCalledOnce();
  });
  it('reports permission errors and releases the microphone', () => {
    const { recognition } = setup();
    recognition.onerror?.({ error: 'not-allowed' });
    expect(service.message()).toBe('dictation.permission');
    expect(service.state()).toBe('idle');
    expect(recognition.abort).toHaveBeenCalledOnce();
  });
  it('reports unsupported environments without throwing', () => {
    vi.stubGlobal('SpeechRecognition', undefined);
    vi.stubGlobal('webkitSpeechRecognition', undefined);
    service = new DictationService();
    expect(service.supported).toBe(false);
    service.start('es-MX', vi.fn());
    expect(service.message()).toBe('dictation.unsupported');
    expect(service.state()).toBe('idle');
  });
});

describe('native Vosk dictation', () => {
  let service: DictationService;
  let events: ((event: DictationEvent) => void)[];
  let start: ReturnType<typeof vi.fn>;
  let stop: ReturnType<typeof vi.fn>;
  const setup = () => {
    events = [];
    start = vi.fn((_id: string, _lang: string, callback: (event: DictationEvent) => void) => {
      events.push(callback);
      return Promise.resolve();
    });
    stop = vi.fn(() => Promise.resolve());
    vi.stubGlobal('desktopAPI', { dictationStart: start, dictationStop: stop });
    vi.stubGlobal('SpeechRecognition', undefined);
    vi.stubGlobal('webkitSpeechRecognition', undefined);
    service = new DictationService();
    const insert = vi.fn();
    service.start('es-MX', insert);
    return insert;
  };
  afterEach(() => { service?.ngOnDestroy(); vi.unstubAllGlobals(); });

  it('uses native dictation when the WebView has no speech API', () => {
    setup();
    expect(service.supported).toBe(true);
    expect(service.local).toBe(true);
    expect(start).toHaveBeenCalledWith(expect.any(String), 'es-MX', expect.any(Function));
  });
  it('loads the local model without inserting provisional text', () => {
    const insert = setup();
    events[0]({ type: 'loading' });
    expect(service.state()).toBe('loading');
    events[0]({ type: 'listening' });
    events[0]({ type: 'partial', text: 'este libro' });
    expect(service.interim()).toBe('este libro');
    expect(insert).not.toHaveBeenCalled();
    events[0]({ type: 'final', text: 'este libro cuenta una historia' });
    expect(insert).toHaveBeenCalledExactlyOnceWith('este libro cuenta una historia');
    expect(service.interim()).toBe('');
  });
  it('flushes the final phrase on stop', () => {
    const insert = setup();
    events[0]({ type: 'listening' });
    service.stop();
    expect(stop).toHaveBeenCalledWith(start.mock.calls[0][0], false);
    expect(service.state()).toBe('stopping');
    events[0]({ type: 'final', text: 'última frase' });
    events[0]({ type: 'ended' });
    expect(insert).toHaveBeenCalledExactlyOnceWith('última frase');
    expect(service.state()).toBe('idle');
  });
  it('cancels local model loading and ignores late callbacks', () => {
    const insert = setup();
    events[0]({ type: 'loading' });
    service.stop();
    expect(stop).toHaveBeenCalledWith(start.mock.calls[0][0], true);
    events[0]({ type: 'listening' });
    events[0]({ type: 'final', text: 'no insertar' });
    expect(service.state()).toBe('idle');
    expect(insert).not.toHaveBeenCalled();
  });
  it('ignores results from a cancelled session after starting another language', () => {
    const insert = setup();
    service.abort();
    service.start('fr-FR', insert);
    events[0]({ type: 'ended' });
    events[0]({ type: 'final', text: 'texto anterior' });
    events[1]({ type: 'listening' });
    events[1]({ type: 'final', text: 'bonjour' });
    expect(insert).toHaveBeenCalledExactlyOnceWith('bonjour');
    expect(start.mock.calls[1][1]).toBe('fr-FR');
    expect(service.state()).toBe('listening');
  });
  it('retains a useful error after the worker ends', () => {
    setup();
    events[0]({ type: 'error', code: 'microphone' });
    events[0]({ type: 'ended' });
    expect(service.message()).toBe('dictation.microphone');
    expect(service.state()).toBe('idle');
  });
  it('handles command rejection without waiting for a native event', async () => {
    setup();
    service.abort();
    start.mockRejectedValueOnce('language');
    service.start('ja-JP', vi.fn());
    await Promise.resolve();
    expect(service.message()).toBe('dictation.language');
    expect(service.state()).toBe('idle');
  });
});
