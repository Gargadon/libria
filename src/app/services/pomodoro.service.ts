import { Injectable, signal, effect, untracked } from '@angular/core';

export type PomodoroMode = 'focus' | 'short-break' | 'long-break';

@Injectable({ providedIn: 'root' })
export class PomodoroService {
  readonly timeRemaining = signal(25 * 60); // 25 minutes default
  readonly isActive = signal(false);
  readonly mode = signal<PomodoroMode>('focus');
  readonly focusCount = signal(0);

  // Settings (in minutes)
  readonly focusDuration = signal(25);
  readonly shortBreakDuration = signal(5);
  readonly longBreakDuration = signal(15);

  private timerInterval: any = null;

  constructor() {
    // Reset timer when duration/mode settings change, but NOT on pause
    effect(() => {
      this.focusDuration();
      this.shortBreakDuration();
      this.longBreakDuration();
      this.mode();
      if (untracked(() => !this.isActive())) {
        this.resetTimeForMode();
      }
    }, { allowSignalWrites: true });
  }

  start() {
    if (this.isActive()) return;
    this.isActive.set(true);

    this.timerInterval = setInterval(() => {
      const remaining = this.timeRemaining();
      if (remaining > 0) {
        this.timeRemaining.set(remaining - 1);
      } else {
        this.sessionCompleted();
      }
    }, 1000);
  }

  pause() {
    if (!this.isActive()) return;
    this.isActive.set(false);
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  reset() {
    this.pause();
    this.resetTimeForMode();
  }

  setMode(newMode: PomodoroMode) {
    this.pause();
    this.mode.set(newMode);
    this.resetTimeForMode();
  }

  private resetTimeForMode() {
    const mins = this.mode() === 'focus' 
      ? this.focusDuration() 
      : (this.mode() === 'short-break' ? this.shortBreakDuration() : this.longBreakDuration());
    this.timeRemaining.set(mins * 60);
  }

  private sessionCompleted() {
    this.pause();
    this.playChime();

    if (this.mode() === 'focus') {
      const count = this.focusCount() + 1;
      this.focusCount.set(count);
      // Every 4 focus sessions, take a long break. Otherwise, a short break.
      if (count % 4 === 0) {
        this.mode.set('long-break');
      } else {
        this.mode.set('short-break');
      }
    } else {
      this.mode.set('focus');
    }

    this.resetTimeForMode();
  }

  private playChime() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      // Chime synthesis: a fundamental note and two harmonics
      const playTone = (freq: number, startDelay: number, duration: number, vol: number) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + startDelay);
        
        gainNode.gain.setValueAtTime(0, ctx.currentTime + startDelay);
        gainNode.gain.linearRampToValueAtTime(vol, ctx.currentTime + startDelay + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startDelay + duration);
        
        osc.start(ctx.currentTime + startDelay);
        osc.stop(ctx.currentTime + startDelay + duration);
      };

      // Play a beautiful dual-tone chime
      playTone(523.25, 0, 1.2, 0.25); // C5 fundamental
      playTone(659.25, 0.1, 1.0, 0.15); // E5 major third
      playTone(783.99, 0.2, 0.8, 0.1);  // G5 perfect fifth
    } catch (e) {
      console.warn('Web Audio chime failed', e);
    }
  }

  getFormattedTime(): string {
    const totalSecs = this.timeRemaining();
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}
