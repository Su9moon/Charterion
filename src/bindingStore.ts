import { EMPTY_BINDING, type ChatSnapshot, type RoleBinding } from './contracts';

type StorageArea = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

export type BindingStores = {
  persistent: Record<string, RoleBinding>;
  ephemeral: Record<string, TabBinding>;
  dirty: boolean;
};

export type TabBinding = RoleBinding & { provisionalKey?: string };

export type BindingStore = ReturnType<typeof createBindingStore>;

type BindingStorage = {
  local: StorageArea;
  session: StorageArea;
};

type BindingKeys = {
  persistent: string;
  ephemeral: string;
};

function parseBinding(value: unknown): TabBinding | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item.role !== 'string' || typeof item.project !== 'string' || typeof item.notes !== 'string') return undefined;
  if (item.agentSlotId !== undefined && typeof item.agentSlotId !== 'string') return undefined;
  return {
    role: item.role,
    project: item.project,
    notes: item.notes,
    ...(typeof item.projectId === 'string' ? { projectId: item.projectId } : {}),
    ...(typeof item.provisionalKey === 'string' ? { provisionalKey: item.provisionalKey } : {}),
    ...(typeof item.agentSlotId === 'string' ? { agentSlotId: item.agentSlotId } : {}),
  };
}

function parseBindingMap(value: unknown): Record<string, TabBinding> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, TabBinding> = {};
  for (const [key, raw] of Object.entries(value)) {
    const binding = parseBinding(raw);
    if (binding) result[key] = binding;
  }
  return result;
}

function sameBinding(left: RoleBinding | undefined, right: RoleBinding): boolean {
  return Boolean(
    left &&
    left.role === right.role &&
    left.project === right.project &&
    left.projectId === right.projectId &&
    left.notes === right.notes &&
    left.agentSlotId === right.agentSlotId,
  );
}

export function createBindingStore(storage: BindingStorage, keys: BindingKeys) {
  async function readPersistent(): Promise<Record<string, RoleBinding>> {
    const stored = await storage.local.get(keys.persistent);
    return parseBindingMap(stored[keys.persistent]);
  }

  async function readEphemeral(): Promise<Record<string, TabBinding>> {
    const stored = await storage.session.get(keys.ephemeral);
    return parseBindingMap(stored[keys.ephemeral]);
  }

  async function read(): Promise<BindingStores> {
    const [persistent, ephemeral] = await Promise.all([readPersistent(), readEphemeral()]);
    return { persistent, ephemeral, dirty: false };
  }

  async function writePersistent(bindings: Record<string, RoleBinding>): Promise<void> {
    await storage.local.set({ [keys.persistent]: bindings });
  }

  async function writeEphemeral(bindings: Record<string, RoleBinding>): Promise<void> {
    await storage.session.set({ [keys.ephemeral]: bindings });
  }

  function resolve(tabId: number, snapshot: ChatSnapshot, stores: BindingStores): RoleBinding {
    const durable = stores.persistent[snapshot.conversationKey];
    const temporary = stores.ephemeral[String(tabId)];
    if (durable) {
      if (temporary && (temporary.project !== durable.project || temporary.projectId !== durable.projectId || temporary.role !== durable.role || temporary.agentSlotId !== durable.agentSlotId)) return { ...EMPTY_BINDING };
      return durable;
    }
    if (!temporary) return { ...EMPTY_BINDING };
    // Observation is never permission to persist or to follow navigation.
    if (snapshot.conversationKey.startsWith('conversation:') ||
        (temporary.provisionalKey && temporary.provisionalKey !== snapshot.conversationKey)) return { ...EMPTY_BINDING };
    const { provisionalKey: _, ...binding } = temporary;
    return binding;
  }

  async function persist(stores: BindingStores): Promise<void> {
    if (!stores.dirty) return;
    await Promise.all([writePersistent(stores.persistent), writeEphemeral(stores.ephemeral)]);
    stores.dirty = false;
  }

  async function update(tabId: number, conversationKey: string, binding: RoleBinding, confirmedByKernel = false): Promise<void> {
    const tabKey = String(tabId);
    if (!conversationKey.startsWith('conversation:')) {
      const ephemeral = await readEphemeral();
      if (sameBinding(ephemeral[tabKey], binding) && ephemeral[tabKey]?.provisionalKey === conversationKey) return;
      ephemeral[tabKey] = { ...binding, provisionalKey: conversationKey };
      await writeEphemeral(ephemeral);
      return;
    }

    const [persistent, ephemeral] = await Promise.all([readPersistent(), readEphemeral()]);
    const existing = persistent[conversationKey];
    const legacyProjection = confirmedByKernel && existing && !existing.projectId && existing.role === binding.role && existing.project === binding.project && existing.agentSlotId === binding.agentSlotId;
    if (existing && !legacyProjection && (existing.role !== binding.role || existing.project !== binding.project || existing.projectId !== binding.projectId || existing.agentSlotId !== binding.agentSlotId)) {
      throw new Error('Conversation already has a different project/role binding; explicit unbind is required');
    }
    let removedProjection = false;
    for (const [key, current] of Object.entries(persistent)) {
      if (key !== conversationKey && current.project === binding.project && current.projectId === binding.projectId && current.role === binding.role) {
        if (!confirmedByKernel || !binding.agentSlotId || binding.agentSlotId !== current.agentSlotId) throw new Error('Project role already has a durable Conversation binding');
        // A verified Kernel rollover changes only this Slot's local projection.
        delete persistent[key];
        removedProjection = true;
      }
    }
    const persistentChanged = removedProjection || !sameBinding(persistent[conversationKey], binding);
    if (persistentChanged) persistent[conversationKey] = binding;
    const hadTemporary = Object.hasOwn(ephemeral, tabKey);
    if (hadTemporary) delete ephemeral[tabKey];
    await Promise.all([
      ...(persistentChanged ? [writePersistent(persistent)] : []),
      ...(hadTemporary ? [writeEphemeral(ephemeral)] : []),
    ]);
  }

  async function clear(conversationKey: string | undefined, tabId: number | undefined): Promise<void> {
    const hasConversation = Boolean(conversationKey);
    const tabKey = tabId === undefined ? undefined : String(tabId);
    if (!hasConversation && tabKey === undefined) return;

    if (hasConversation && tabKey === undefined) {
      const persistent = await readPersistent();
      if (!Object.hasOwn(persistent, conversationKey!)) return;
      delete persistent[conversationKey!];
      await writePersistent(persistent);
      return;
    }
    if (!hasConversation && tabKey !== undefined) {
      const ephemeral = await readEphemeral();
      if (!Object.hasOwn(ephemeral, tabKey)) return;
      delete ephemeral[tabKey];
      await writeEphemeral(ephemeral);
      return;
    }

    const [persistent, ephemeral] = await Promise.all([readPersistent(), readEphemeral()]);
    const persistentChanged = Object.hasOwn(persistent, conversationKey!);
    const ephemeralChanged = Object.hasOwn(ephemeral, tabKey!);
    if (persistentChanged) delete persistent[conversationKey!];
    if (ephemeralChanged) delete ephemeral[tabKey!];
    await Promise.all([
      ...(persistentChanged ? [writePersistent(persistent)] : []),
      ...(ephemeralChanged ? [writeEphemeral(ephemeral)] : []),
    ]);
  }

  return {
    readPersistent,
    readEphemeral,
    read,
    writePersistent,
    writeEphemeral,
    resolve,
    persist,
    update,
    clear,
  };
}
