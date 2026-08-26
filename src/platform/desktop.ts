import { LogicalPosition, LogicalSize, getCurrentWindow } from '@tauri-apps/api/window';

export interface WindowState { width: number; height: number; x?: number; y?: number; maximized?: boolean; alwaysOnTop?: boolean }
export interface DesktopPlatform {
  setAlwaysOnTop(enabled: boolean): Promise<void>;
  enterMiniMode(): Promise<void>;
  exitMiniMode(): Promise<void>;
  getWindowState(): Promise<WindowState>;
  saveWindowState(state: WindowState): Promise<void>;
  startDragging(): Promise<void>;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
}

const browserStateKey = 'galnavi.window-state';
class BrowserPlatform implements DesktopPlatform {
  async setAlwaysOnTop(enabled: boolean) {
    const current = await this.getWindowState(); await this.saveWindowState({ ...current, alwaysOnTop: enabled });
  }
  async enterMiniMode() { /* CSS-only preview */ }
  async exitMiniMode() { /* CSS-only preview */ }
  async getWindowState(): Promise<WindowState> { try { return JSON.parse(localStorage.getItem(browserStateKey) ?? '') as WindowState; } catch { return { width: 1180, height: 760 }; } }
  async saveWindowState(state: WindowState) { localStorage.setItem(browserStateKey, JSON.stringify(state)); }
  async startDragging() { /* unavailable in browser */ }
  async minimize() { /* unavailable in browser */ }
  async toggleMaximize() { /* unavailable in browser */ }
  async close() { /* unavailable in browser */ }
}

class TauriDesktopPlatform implements DesktopPlatform {
  private previous: WindowState = { width: 1180, height: 760 };
  async setAlwaysOnTop(enabled: boolean) {
    await getCurrentWindow().setAlwaysOnTop(enabled);
    await this.saveWindowState({ ...await this.getWindowState(), alwaysOnTop: enabled });
  }
  async enterMiniMode() {
    this.previous = await this.getWindowState();
    const window = getCurrentWindow();
    if (this.previous.maximized) await window.unmaximize();
    await window.setMinSize(new LogicalSize(360, 220));
    await window.setSize(new LogicalSize(420, 260));
    await window.setAlwaysOnTop(true);
  }
  async exitMiniMode() {
    const window = getCurrentWindow();
    await window.setMinSize(undefined);
    await window.setSize(new LogicalSize(Math.max(720, this.previous.width), Math.max(560, this.previous.height)));
    if (this.previous.x !== undefined && this.previous.y !== undefined) await window.setPosition(new LogicalPosition(this.previous.x, this.previous.y));
    await window.setMinSize(new LogicalSize(720, 560));
    await window.setAlwaysOnTop(this.previous.alwaysOnTop ?? false);
    if (this.previous.maximized) await window.maximize();
  }
  async getWindowState(): Promise<WindowState> {
    const window = getCurrentWindow(); const [size, position, maximized, alwaysOnTop] = await Promise.all([window.innerSize(), window.outerPosition(), window.isMaximized(), window.isAlwaysOnTop()]);
    const factor = await window.scaleFactor(); return { width: size.width / factor, height: size.height / factor, x: position.x / factor, y: position.y / factor, maximized, alwaysOnTop };
  }
  async saveWindowState(state: WindowState) { localStorage.setItem(browserStateKey, JSON.stringify(state)); }
  async startDragging() { await getCurrentWindow().startDragging(); }
  async minimize() { await getCurrentWindow().minimize(); }
  async toggleMaximize() { await getCurrentWindow().toggleMaximize(); }
  async close() { await getCurrentWindow().close(); }
}

export const desktopPlatform: DesktopPlatform = window.__TAURI_INTERNALS__ ? new TauriDesktopPlatform() : new BrowserPlatform();

export async function restoreWindowState(): Promise<void> {
  if (!window.__TAURI_INTERNALS__) return;
  try {
    const raw = localStorage.getItem(browserStateKey); if (!raw) return;
    const state = JSON.parse(raw) as WindowState; const windowHandle = getCurrentWindow();
    await windowHandle.setSize(new LogicalSize(Math.max(720, state.width), Math.max(560, state.height)));
    if (state.x !== undefined && state.y !== undefined) await windowHandle.setPosition(new LogicalPosition(state.x, state.y));
    await windowHandle.setAlwaysOnTop(state.alwaysOnTop ?? false);
    if (state.maximized) await windowHandle.maximize();
  } catch { /* retain Tauri defaults when stale window data is invalid */ }
}

export async function watchWindowState(): Promise<() => void> {
  if (!window.__TAURI_INTERNALS__) return () => undefined;
  const windowHandle = getCurrentWindow(); let timer: number | undefined;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void desktopPlatform.getWindowState().then((state) => desktopPlatform.saveWindowState(state)), 250);
  };
  const [unlistenResize, unlistenMove] = await Promise.all([windowHandle.onResized(schedule), windowHandle.onMoved(schedule)]);
  return () => { window.clearTimeout(timer); unlistenResize(); unlistenMove(); };
}
