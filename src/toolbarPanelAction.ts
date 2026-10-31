/**
 * Register an action-click handler that does not depend on whether Chrome
 * persists openPanelOnActionClick after browser restart.
 *
 * Keep auto-toggle disabled: the action click handler is the sole owner of
 * opening the panel, so Chrome cannot consume a click via auto-toggle.
 */
export function installToolbarPanelAction(
  api: {
    action: {
      onClicked: {
        addListener(listener: (tab: { windowId: number }) => void): void;
      };
    };
    sidePanel: {
      open(options: { windowId: number }): Promise<void>;
      setPanelBehavior(behavior: { openPanelOnActionClick: boolean }): Promise<void>;
    };
  },
  reportError: (phase: 'open' | 'configuration', error: unknown) => void,
): void {
  api.action.onClicked.addListener((tab) => {
    // Call open directly in the Chrome user-gesture callback. Do not await
    // another operation first: sidePanel.open requires a user gesture.
    void api.sidePanel.open({ windowId: tab.windowId }).catch((error) => reportError('open', error));
  });
  void api.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
    .catch((error) => reportError('configuration', error));
}
