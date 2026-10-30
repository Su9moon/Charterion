import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('ships exactly English and Simplified Chinese as active languages', () => {
  const root = process.cwd();
  const manifest = JSON.parse(readFileSync(resolve(root, 'docs/readme/LANGUAGES.json'), 'utf8'));
  expect(manifest.default).toBe('en');
  expect(manifest.languages.map((item: { locale: string }) => item.locale).sort()).toEqual(['en', 'zh-CN']);
  expect(readdirSync(root).filter(name => /^README(?:\..+)?\.md$/.test(name)).sort()).toEqual(['README.md', 'README.zh-CN.md']);
  const state = JSON.parse(readFileSync(resolve(root, 'docs/readme/TRANSLATION_STATE.json'), 'utf8'));
  expect(Object.keys(state.translations)).toEqual(['zh-CN']);
  for (const file of ['README.md', 'README.zh-CN.md']) {
    const text = readFileSync(resolve(root, file), 'utf8');
    const nav = text.split('<!-- readme-i18n:navigation:start -->')[1]!.split('<!-- readme-i18n:navigation:end -->')[0]!;
    expect(nav).toContain('English'); expect(nav).toContain('简体中文');
    expect(nav).not.toMatch(/zh-TW|日本語|한국어|Español|Português|Français|Deutsch|Русский/);
  }
});
