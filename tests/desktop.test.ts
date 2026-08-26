import { beforeEach, describe, expect, it } from 'vitest';
import { desktopPlatform } from '../src/platform/desktop';

describe('desktop window state', () => {
  beforeEach(() => localStorage.clear());

  it('persists the lock state in the browser adapter', async () => {
    await desktopPlatform.setAlwaysOnTop(true);
    expect(await desktopPlatform.getWindowState()).toMatchObject({ alwaysOnTop: true });

    await desktopPlatform.setAlwaysOnTop(false);
    expect(await desktopPlatform.getWindowState()).toMatchObject({ alwaysOnTop: false });
  });
});
