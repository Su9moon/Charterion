import { createBindingStore } from './bindingStore';
import { EMPTY_BINDING, type ChatSnapshot, type RoleBinding } from './contracts';
import { MutationLane } from './mutationLane';

type StorageArea = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

type BindingStorage = { local: StorageArea; session: StorageArea };
type BindingKeys = { persistent: string; ephemeral: string };
type BindingResolver = (tabId: number, snapshot: ChatSnapshot) => RoleBinding;

export function createBindingRegistry(storage: BindingStorage, keys: BindingKeys,
  confirm?: (tabId: number, snapshot: ChatSnapshot, binding: RoleBinding, provisionalKey?: string) => Promise<boolean>) {
  const store = createBindingStore(storage, keys);
  const lane = new MutationLane();

  function run<T>(operation: () => Promise<T>): Promise<T> {
    return lane.run(operation);
  }

  async function resolve(tabId: number, snapshot: ChatSnapshot): Promise<RoleBinding> {
    return run(async () => {
      const stores = await store.read();
      let binding = store.resolve(tabId, snapshot, stores);
      const pending = stores.ephemeral[String(tabId)];
      if (!binding.role && snapshot.conversationId && pending?.provisionalKey && !stores.persistent[snapshot.conversationKey] && confirm) {
        const { provisionalKey, ...candidate } = pending;
        if (await confirm(tabId, snapshot, candidate, provisionalKey)) {
          await store.update(tabId, snapshot.conversationKey, candidate, true);
          binding = candidate;
        }
      } else if (binding.role && confirm && !await confirm(tabId, snapshot, binding)) return { ...EMPTY_BINDING };
      return binding;
    });
  }

  async function project<T>(operation: (resolveBinding: BindingResolver) => T | Promise<T>): Promise<T> {
    return run(async () => {
      const stores = await store.read();
      const result = await operation((tabId, snapshot) => store.resolve(tabId, snapshot, stores));
      await store.persist(stores);
      return result;
    });
  }

  function update(tabId: number, conversationKey: string, binding: RoleBinding, confirmedByKernel = false): Promise<void> {
    return run(() => store.update(tabId, conversationKey, binding, confirmedByKernel));
  }

  function clear(conversationKey: string | undefined, tabId: number | undefined): Promise<void> {
    return run(() => store.clear(conversationKey, tabId));
  }

  function readPersistent(): Promise<Record<string, RoleBinding>> {
    return run(() => store.readPersistent());
  }

  return {
    run,
    resolve,
    project,
    update,
    clear,
    readPersistent,
    waitForIdle: () => lane.waitForIdle(),
  };
}
