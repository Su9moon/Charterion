import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const background = readFileSync(new URL('../src/background.ts', import.meta.url), 'utf8');
const sidePanel = readFileSync(new URL('../src/sidepanel.ts', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8')) as {
  action?: { default_title?: string };
  side_panel?: { default_path?: string };
  permissions?: string[];
};

describe('Hive toolbar and radar navigation contract', () => {
  it('opens the native side panel from the extension toolbar action', () => {
    expect(manifest.permissions).toContain('sidePanel');
    expect(manifest.side_panel?.default_path).toBe('dist/sidepanel.html');
    expect(manifest.action?.default_title).toContain('侧边栏');
    expect(background).toContain('chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })');
    expect(background).not.toMatch(/chrome\.action\.onClicked\.addListener\s*\(/);
  });

  it('keeps the status radar behind the explicit Open Console action inside the panel', () => {
    expect(sidePanel).toContain("required<HTMLButtonElement>('open-console')");
    expect(sidePanel).toContain("type: 'manager:open-console'");
    expect(background).toContain("if (message.type === 'manager:open-console')");
    expect(background).toContain('validatedRadarUrl(await readNativeRadarUrl())');
  });
});
