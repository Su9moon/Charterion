import { describe, expect, it } from 'vitest';
import { createBindingRegistry } from '../src/bindingRegistry';
import type { ChatSnapshot } from '../src/contracts';

function memoryArea(initial: Record<string, unknown> = {}) {
  let values = { ...initial };
  return {
    async get(key: string) { return { [key]: values[key] }; },
    async set(items: Record<string, unknown>) { values = { ...values, ...items }; },
    read: () => values,
  };
}

function snapshot(key: string, conversationId?: string): ChatSnapshot {
  return {
    conversationKey: key,
    ...(conversationId ? { conversationId } : {}),
    title: 'ChatGPT',
    url: 'https://chatgpt.com/',
    status: 'idle',
    confidence: 'direct',
    signals: ['composer-ready'],
    assistantMessageCount: 0,
    latestAssistantText: '',
    observedAt: 1,
  };
}

describe('binding registry', () => {
  it('promotes only after explicit provisional assignment and Kernel confirmation, once', async () => {
    const local = memoryArea();
    const session = memoryArea();
    const confirmations: Array<string | undefined> = [];
    let allowed = false;
    const registry = createBindingRegistry({ local, session }, { persistent: 'bindings', ephemeral: 'tabs' }, async (_tab, _snapshot, _binding, provisional) => {
      confirmations.push(provisional); return allowed;
    });
    const binding = { role: 'chief_engineer', project: 'P', projectId: 'p', notes: '', agentSlotId: 'slot' };
    await registry.update(7, 'provisional:one', binding);
    expect((await registry.resolve(7, snapshot('conversation:one', 'one'))).role).toBe('');
    expect(local.read().bindings).toBeUndefined();
    allowed = true;
    expect(await registry.resolve(7, snapshot('conversation:one', 'one'))).toEqual(binding);
    expect(local.read().bindings).toEqual({ 'conversation:one': binding });
    expect(session.read().tabs).toEqual({});
    expect((await registry.resolve(7, snapshot('conversation:two', 'two'))).role).toBe('');
    expect(confirmations).toEqual(['provisional:one', 'provisional:one']);
  });

  it('does not persist when Kernel confirmation fails', async () => {
    const local = memoryArea();
    const session = memoryArea();
    const registry = createBindingRegistry({ local, session }, { persistent: 'bindings', ephemeral: 'tabs' }, async () => { throw new Error('Kernel unavailable'); });
    await registry.update(7, 'provisional:one', { role: 'A', project: 'P', notes: '' });
    await expect(registry.resolve(7, snapshot('conversation:one', 'one'))).rejects.toThrow('Kernel unavailable');
    expect(local.read().bindings).toBeUndefined();
    expect(session.read().tabs).toMatchObject({ '7': { provisionalKey: 'provisional:one' } });
  });
  it('projects multiple bindings through one serialized store scope', async () => {
    const local = memoryArea();
    const session = memoryArea({ tabs: { '7': { role: 'WORKER', project: 'P', notes: '' } } });
    const registry = createBindingRegistry(
      { local, session },
      { persistent: 'bindings', ephemeral: 'tabs' },
    );

    const roles = await registry.project((resolve) => [
      resolve(7, snapshot('conversation:abc', 'abc')).role,
      resolve(8, snapshot('url:https://chatgpt.com/')).role,
    ]);

    expect(roles).toEqual(['', '']);
    expect(local.read().bindings).toBeUndefined();
    expect(session.read().tabs).toEqual({ '7': { role: 'WORKER', project: 'P', notes: '' } });
  });

  it('serializes concurrent updates so ephemeral bindings cannot overwrite each other', async () => {
    const local = memoryArea();
    const session = memoryArea();
    const registry = createBindingRegistry(
      { local, session },
      { persistent: 'bindings', ephemeral: 'tabs' },
    );

    await Promise.all([
      registry.update(7, 'url:https://chatgpt.com/', { role: 'A', project: 'P', notes: '' }),
      registry.update(8, 'url:https://chatgpt.com/', { role: 'B', project: 'P', notes: '' }),
    ]);

    expect(session.read().tabs).toEqual({
      '7': { role: 'A', project: 'P', notes: '', provisionalKey: 'url:https://chatgpt.com/' },
      '8': { role: 'B', project: 'P', notes: '', provisionalKey: 'url:https://chatgpt.com/' },
    });
  });
});
