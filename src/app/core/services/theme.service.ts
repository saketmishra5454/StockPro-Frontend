import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const THEME_KEY = 'stockpro.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  readonly mode = signal<ThemeMode>(this.restoreTheme());

  constructor() {
    this.apply(this.mode());
  }

  toggle(): void {
    this.setTheme(this.mode() === 'dark' ? 'light' : 'dark');
  }

  setTheme(mode: ThemeMode): void {
    localStorage.setItem(THEME_KEY, mode);
    this.mode.set(mode);
    this.apply(mode);
  }

  private restoreTheme(): ThemeMode {
    const stored = localStorage.getItem(THEME_KEY);

    if (stored === 'light' || stored === 'dark') {
      return stored;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private apply(mode: ThemeMode): void {
    this.document.documentElement.classList.toggle('dark', mode === 'dark');
  }
}
