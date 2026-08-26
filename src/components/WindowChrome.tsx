import { Minus, Square, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import logoUrl from '../assets/galnavi-logo.svg';
import { desktopPlatform } from '../platform/desktop';
import { useUiStore } from '../stores/uiStore';

export function WindowChrome() {
  const setError = useUiStore((state) => state.setError);
  const [maximized, setMaximized] = useState(false);
  const run = (action: () => Promise<void>, label: string) => void action().catch((error: unknown) => setError(`${label}失败：${error instanceof Error ? error.message : '窗口权限不可用'}`));
  const refreshMaximized = useCallback(() => void desktopPlatform.getWindowState().then((state) => setMaximized(state.maximized === true)).catch(() => setMaximized(false)), []);
  useEffect(() => {
    refreshMaximized();
    window.addEventListener('resize', refreshMaximized);
    return () => window.removeEventListener('resize', refreshMaximized);
  }, [refreshMaximized]);
  const toggleWindowSize = async () => { await desktopPlatform.toggleMaximize(); refreshMaximized(); };
  return <div className={`window-chrome-zone ${maximized ? 'maximized' : 'windowed'}`}>
    <div className="window-chrome">
      <div className="window-drag-region" data-tauri-drag-region onMouseDown={(event) => { if (event.button === 0) run(() => desktopPlatform.startDragging(), '拖动窗口'); }} onDoubleClick={() => run(toggleWindowSize, '切换窗口大小')}>
        <span className="window-chrome-mark" aria-hidden><img src={logoUrl} alt=""/></span><span>GalNavi</span>
      </div>
      <nav className="window-controls" aria-label="窗口控制">
        <button className="icon-button" title="最小化" aria-label="最小化窗口" onMouseDown={(event) => event.stopPropagation()} onClick={() => run(() => desktopPlatform.minimize(), '最小化窗口')}><Minus size={15}/></button>
        <button className="icon-button" title="最大化或还原" aria-label="最大化或还原窗口" onMouseDown={(event) => event.stopPropagation()} onClick={() => run(toggleWindowSize, '切换窗口大小')}><Square size={13}/></button>
        <button className="icon-button window-close" title="关闭" aria-label="关闭窗口" onMouseDown={(event) => event.stopPropagation()} onClick={() => run(() => desktopPlatform.close(), '关闭窗口')}><X size={16}/></button>
      </nav>
    </div>
  </div>;
}
