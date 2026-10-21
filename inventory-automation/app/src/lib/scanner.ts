/* Hardware barcode scanner support.
 *
 * Most USB scanners work as a keyboard wedge: they type the code and press
 * Enter. We detect those fast keystrokes globally so no driver is required.
 * Serial/COM scanners are supported through the Web Serial API (Electron and
 * Chromium builds expose it).
 */
import { useEffect, useRef } from 'react';

export type ScannerMode = 'hardware' | 'camera';
export type ScannerTerminator = 'enter' | 'tab' | 'none';

export interface ScannerSettings {
  mode: ScannerMode;
  minLength: number;
  terminator: ScannerTerminator;
}

const SETTINGS_KEY = 'ors.scanner';

export const DEFAULT_SCANNER: ScannerSettings = {
  mode: 'hardware',
  minLength: 6,
  terminator: 'enter'
};

export function getScannerSettings(): ScannerSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SCANNER };
    const parsed = JSON.parse(raw) as Partial<ScannerSettings>;
    return {
      mode: parsed.mode === 'camera' ? 'camera' : 'hardware',
      minLength: Math.min(64, Math.max(3, Number(parsed.minLength) || DEFAULT_SCANNER.minLength)),
      terminator: parsed.terminator === 'tab' ? 'tab' : parsed.terminator === 'none' ? 'none' : 'enter'
    };
  } catch {
    return { ...DEFAULT_SCANNER };
  }
}

export function saveScannerSettings(settings: ScannerSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage may be unavailable */
  }
}

export function isDesktopShell(): boolean {
  try {
    return typeof window !== 'undefined' && window.location.protocol === 'file:';
  } catch {
    return false;
  }
}

/** True when the Web Serial API is available (Electron / Chromium). */
export function hasSerialSupport(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

interface SerialPortLike {
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
}

interface SerialLike {
  requestPort: () => Promise<SerialPortLike>;
}

let serialStop: (() => void) | null = null;

/**
 * Connects a serial/COM scanner (usually 9600 8N1) and emits `br:scan`
 * events with each complete line. Returns a disconnect function.
 */
export async function connectSerialScanner(baudRate = 9600): Promise<() => void> {
  const serial = (navigator as unknown as { serial?: SerialLike }).serial;
  if (!serial) throw new Error('Web Serial is not available. Use a USB keyboard-wedge scanner instead.');

  const port = await serial.requestPort();
  await port.open({ baudRate });
  const reader = port.readable?.getReader();
  if (!reader) throw new Error('The scanner port could not be read.');

  const decoder = new TextDecoder();
  let buffer = '';
  let closed = false;

  void (async () => {
    try {
      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let index = buffer.search(/[\r\n]/);
        while (index >= 0) {
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          if (line) window.dispatchEvent(new CustomEvent('br:scan', { detail: line }));
          index = buffer.search(/[\r\n]/);
        }
      }
    } catch {
      /* port closed */
    }
  })();

  const stop = () => {
    closed = true;
    void reader.cancel().catch(() => undefined);
    void port.close().catch(() => undefined);
    serialStop = null;
  };
  serialStop = stop;
  return stop;
}

export function disconnectSerialScanner(): void {
  serialStop?.();
}

/**
 * Detects keyboard-wedge scanners anywhere in the app.
 * A scan is a burst of characters (fast, uniform timing) ending with the
 * configured terminator. Modals and drawers are ignored.
 */
export function useHardwareScanner(onScan: (code: string) => void, enabled = true): void {
  const callback = useRef(onScan);
  callback.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    const settings = getScannerSettings();
    let buffer = '';
    let firstAt = 0;
    let lastAt = 0;

    const isBlocked = () => document.querySelector('.dialog, .drawer') !== null;

    const finish = (event: KeyboardEvent) => {
      if (buffer.length >= settings.minLength) {
        const average = buffer.length > 1 ? (lastAt - firstAt) / (buffer.length - 1) : 999;
        if (average <= 45 && !isBlocked()) {
          event.preventDefault();
          event.stopPropagation();
          callback.current(buffer);
        }
      }
      buffer = '';
      firstAt = 0;
      lastAt = 0;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const now = performance.now();
      const isTerminator =
        (event.key === 'Enter' && settings.terminator === 'enter') ||
        (event.key === 'Tab' && settings.terminator === 'tab');
      if (isTerminator) {
        finish(event);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') return;
      if (event.key.length !== 1) return;
      if (now - lastAt > 220) {
        buffer = '';
        firstAt = now;
      }
      buffer += event.key;
      lastAt = now;
      if (buffer.length > 128) buffer = buffer.slice(-128);
    };

    const onSerial = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail) callback.current(String(detail));
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('br:scan', onSerial);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('br:scan', onSerial);
    };
  }, [enabled]);
}
