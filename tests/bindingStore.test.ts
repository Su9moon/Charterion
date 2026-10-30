import { describe, expect, it } from 'vitest';
import { createBindingStore } from '../src/bindingStore';

function memoryArea(initial: Record<string, unknown> = {}) {
  let values = { ...initial };
  let reads = 0;
  let writes = 0;
  return {
    get: async (key: string) => {
      reads += 1;
      return { [key]: values[key] };
    },
    set: async (items: Record<string, unknown>) => {
      values = { ...values, ...items };
      writes += 1;
    },
    read: () => values,
    reads: () => reads,
    writes: () => writes,
  };
}

const snapshot = (conversationKey: string, conversationId?: string) => ({
  conversationKey,
  ...(conversationId ? { conversationId } : {}),
  title: 'ChatGPT',
  url: 'https://chatgpt.com/',
  status: 'idle' as const,
  confidence: 'direct' as const,
  signals: [],
  assistantMessageCount: 0,
  latestAssistantText: '',
  observedAt: 1,
});

describe('binding store', () => {
  it('does not apply a durable binding when the Tab is assigned to another role', async () => {
    const local = memoryArea({ bindings: { 'conversation:one': { role: 'A', project: 'P', notes: '' } } });
    const session = memoryArea({ tabs: { '7': { role: 'B', project: 'P', notes: '' } } });
    const store = createBindingStore({ local, session }, { persistent: 'bindings', ephemeral: 'tabs' });
    const stores = await store.read();

    expect(store.resolve(7, snapshot('conversation:one', 'one'), stores).role).toBe('');
    expect(store.resolve(8, snapshot('conversation:one', 'one'), stores).role).toBe('A');
    expect(local.writes()).toBe(0);
    expect(session.writes()).toBe(0);
  });

  it('does not persist or reuse a temporary tab binding on canonical URL observation', async () => {
    const local = memoryArea();
    const session = memoryArea({ tabs: { '7': { role: 'B', project: 'P', notes: '' } } });
    const store = createBindingStore({ local, session }, { persistent: 'bindings', ephemeral: 'tabs' });
    const stores = await store.read();

    expect(store.resolve(7, snapshot('conversation:two', 'two'), stores).role).toBe('');
    await store.persist(stores);

    expect(local.read().bindings).toBeUndefined();
    expect(session.read().tabs).toEqual({ '7': { role: 'B', project: 'P', notes: '' } });
    expect(local.writes()).toBe(0);
    expect(session.writes()).toBe(0);
  });

  it('writes only session storage for provisional binding updates', async () => {
    const local = memoryArea({ bindings: { 'conversation:one': { role: 'Old', project: 'P', notes: '' } } });
    const session = memoryArea();
    const store = createBindingStore({ local, session }, { persistent: 'bindings', ephemeral: 'tabs' });
    const binding = { role: 'A', project: 'P', notes: '' };

    await store.update(7, 'url:https://chatgpt.com/', binding);

    expect(session.read().tabs).toEqual({ '7': { ...binding, provisionalKey: 'url:https://chatgpt.com/' } });
    expect(local.reads()).toBe(0);
    expect(local.writes()).toBe(0);
    expect(session.writes()).toBe(1);
  });

  it('turns repeated provisional updates into storage no-ops', async () => {
    const binding = { role: 'A', project: 'P', notes: '', agentSlotId: 'slot-1' };
    const local = memoryArea();
    const session = memoryArea({ tabs: { '7': { ...binding, provisionalKey: 'url:https://chatgpt.com/' } } });
    const store = createBindingStore({ local, session }, { persistent: 'bindings', ephemeral: 'tabs' });

    await store.update(7, 'url:https://chatgpt.com/', { ...binding });

    expect(local.reads()).toBe(0);
    expect(local.writes()).toBe(0);
    expect(session.reads()).toBe(1);
    expect(session.writes()).toBe(0);
  });

  it('does not rewrite unchanged canonical bindings or empty session state', async () => {
    const binding = { role: 'A', project: 'P', notes: '' };
    const local = memoryArea({ bindings: { 'conversation:two': binding } });
    const session = memoryArea({ tabs: {} });
    const store = createBindingStore({ local, session }, { persistent: 'bindings', ephemeral: 'tabs' });

    await store.update(7, 'conversation:two', { ...binding });

    expect(local.writes()).toBe(0);
    expect(session.writes()).toBe(0);
  });

  it('does not rewrite session storage when a canonical update has no temporary binding', async () => {
    const local = memoryArea();
    const session = memoryArea({ tabs: {} });
    const store = createBindingStore({ local, session }, { persistent: 'bindings', ephemeral: 'tabs' });
    const binding = { role: 'A', project: 'P', notes: '' };

    await store.update(7, 'conversation:two', binding);

    expect(local.read().bindings).toEqual({ 'conversation:two': binding });
    expect(local.writes()).toBe(1);
    expect(session.writes()).toBe(0);
  });

  it('reads only persistent storage for conversation-only clears', async () => {
    const local = memoryArea({ bindings: { 'conversation:two': { role: 'A', project: 'P', notes: '' } } });
    const session = memoryArea({ tabs: { '7': { role: 'B', project: 'P', notes: '' } } });
    const store = createBindingStore({ local, session }, { persistent: 'bindings', ephemeral: 'tabs' });

    await store.clear('conversation:two', undefined);

    expect(local.reads()).toBe(1);
    expect(local.writes()).toBe(1);
    expect(session.reads()).toBe(0);
    expect(session.writes()).toBe(0);
  });

  it('reads only session storage for tab-only clears', async () => {
    const local = memoryArea({ bindings: { 'conversation:two': { role: 'A', project: 'P', notes: '' } } });
    const session = memoryArea({ tabs: { '7': { role: 'B', project: 'P', notes: '' } } });
    const store = createBindingStore({ local, session }, { persistent: 'bindings', ephemeral: 'tabs' });

    await store.clear(undefined, 7);

    expect(local.reads()).toBe(0);
    expect(local.writes()).toBe(0);
    expect(session.reads()).toBe(1);
    expect(session.writes()).toBe(1);
  });

  it('clears only stores that actually contain the requested binding', async () => {
    const local = memoryArea({ bindings: { 'conversation:two': { role: 'A', project: 'P', notes: '' } } });
    const session = memoryArea({ tabs: {} });
    const store = createBindingStore({ local, session }, { persistent: 'bindings', ephemeral: 'tabs' });

    await store.clear('conversation:two', 7);

    expect(local.read().bindings).toEqual({});
    expect(local.writes()).toBe(1);
    expect(session.writes()).toBe(0);
    await store.clear('conversation:missing', 99);
    expect(local.writes()).toBe(1);
    expect(session.writes()).toBe(0);
  });

  it('preserves update and clear semantics through the adapter API', async () => {
    const local = memoryArea();
    const session = memoryArea();
    const store = createBindingStore({ local, session }, { persistent: 'bindings', ephemeral: 'tabs' });
    const binding = { role: 'A', project: 'P', notes: '' };

    await store.update(7, 'url:https://chatgpt.com/', binding);
    expect(session.read().tabs).toEqual({ '7': { ...binding, provisionalKey: 'url:https://chatgpt.com/' } });

    await store.update(7, 'conversation:two', binding);
    expect(local.read().bindings).toEqual({ 'conversation:two': binding });
    expect(session.read().tabs).toEqual({});

    await store.clear('conversation:two', 7);
    expect(local.read().bindings).toEqual({});
    expect(session.read().tabs).toEqual({});
  });

  it('keeps project/role identity unique and rejects implicit reassignment', async () => {
    const local = memoryArea();
    const store = createBindingStore({ local, session: memoryArea() }, { persistent: 'bindings', ephemeral: 'tabs' });
    const binding = { projectId: 'p1', role: 'chief_engineer', project: 'P', notes: '', agentSlotId: 'slot-one' };
    await store.update(1, 'conversation:one', binding);
    await expect(store.update(2, 'conversation:one', { ...binding, projectId: 'p2' })).rejects.toThrow(/different project\/role/);
    await expect(store.update(2, 'conversation:two', binding)).rejects.toThrow(/already has a durable/);
    expect(local.read().bindings).toEqual({ 'conversation:one': binding });
    await store.update(2, 'conversation:two', binding, true);
    expect(local.read().bindings).toEqual({ 'conversation:two': binding });
  });

  it('does not follow a temporary Tab to a new provisional page', async () => {
    const store = createBindingStore({ local: memoryArea(), session: memoryArea() }, { persistent: 'bindings', ephemeral: 'tabs' });
    await store.update(1, 'provisional:one', { project: 'P', role: 'A', notes: '' });
    const stores = await store.read();
    expect(store.resolve(1, snapshot('provisional:one'), stores).role).toBe('A');
    expect(store.resolve(1, snapshot('provisional:two'), stores).role).toBe('');
  });
});
