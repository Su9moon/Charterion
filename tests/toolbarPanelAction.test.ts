import { describe, expect, it, vi } from 'vitest';
import { installToolbarPanelAction } from '../src/toolbarPanelAction';

describe('toolbar side panel activation across Chrome restarts', () => {
  function setup(initialBehavior = false) {
    let onClick: ((tab: { windowId: number }) => void) | undefined;
    let behavior = initialBehavior;
    const open = vi.fn(async (_options: { windowId: number }) => {});
    const setPanelBehavior = vi.fn(async (options: { openPanelOnActionClick: boolean }) => {
      behavior = options.openPanelOnActionClick;
    });
    const reportError = vi.fn();
    installToolbarPanelAction({
      action: { onClicked: { addListener(listener) { onClick = listener; } } },
      sidePanel: { open, setPanelBehavior },
    }, reportError);
    return { click(windowId: number) { if (!onClick) throw new Error('missing action listener'); onClick({ windowId }); },
      open, setPanelBehavior, reportError, get behavior() { return behavior; } };
  }

  it('opens a native panel directly on click even when Chrome resets auto-toggle to false', async () => {
    const browserAfterRestart = setup(false);
    browserAfterRestart.click(17);
    expect(browserAfterRestart.open).toHaveBeenCalledWith({ windowId: 17 });
    expect(browserAfterRestart.behavior).toBe(false);
    expect(browserAfterRestart.reportError).not.toHaveBeenCalled();
  });

  it('disables stale auto-toggle and uses the explicit handler when previously true', async () => {
    const browser = setup(true);
    expect(browser.setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: false });
    expect(browser.behavior).toBe(false);
    browser.click(31);
    expect(browser.open).toHaveBeenCalledTimes(1);
    expect(browser.open).toHaveBeenCalledWith({ windowId: 31 });
  });

  it('reports an open failure without hiding it or retrying the user action', async () => {
    let click: ((tab: { windowId: number }) => void) | undefined;
    const reportError = vi.fn();
    const open = vi.fn(async () => { throw new Error('side panel denied'); });
    installToolbarPanelAction({
      action: { onClicked: { addListener(listener) { click = listener; } } },
      sidePanel: { open, setPanelBehavior: async () => {} },
    }, reportError);
    if (!click) throw new Error('missing action listener');
    (click as (tab: {windowId:number})=>void)({ windowId: 3 });
    await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith('open', expect.any(Error)));
    expect(open).toHaveBeenCalledTimes(1);
  });
});
