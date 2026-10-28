import type { ControlDatabase } from './database';
import { CharterionCbDispatchJournal, type CbDispatchInput } from './charterionCbDispatchJournal';
import { record } from './rpcParams';

/** Host-only configuration. Never populate this from RPC params or browser state. */
export interface CbDispatchAdminBinding {
  enabled: true;
  clientId: string;
  project: string;
}

/** Administrative intent facade only; no submission, workspace, ACK or review operations. */
export class CharterionCbDispatchRpc {
  private readonly binding?: Readonly<CbDispatchAdminBinding>;
  constructor(private readonly database: ControlDatabase, binding?: CbDispatchAdminBinding) {
    if (binding?.enabled === true) {
      if (![binding.clientId, binding.project].every((s) => typeof s === 'string' && s.trim() && s.length <= 1024)) {
        throw new Error('Invalid CB host binding');
      }
      this.binding = Object.freeze({ ...binding });
    }
  }

  handle(method: string, value: unknown): unknown {
    const binding = this.binding;
    if (!binding) throw new Error('CB dispatch disabled: host binding required');
    const params = record(value);
    const allowed = method === 'cb-dispatch.prepare'
      ? ['dispatchId', 'workItemId', 'project', 'task', 'sourceRef', 'inputRef', 'options']
      : ['dispatchId', 'project'];
    if (Object.keys(params).some((key) => !allowed.includes(key))) throw new Error('Invalid CB dispatch parameter');
    if (params.project !== binding.project) throw new Error('CB dispatch scope rejected');
    // Instantiate only after authorization (router) and host scope checks.
    const journal = new CharterionCbDispatchJournal(this.database, binding.clientId);
    if (method === 'cb-dispatch.lookup') return journal.lookup(params.dispatchId as string);
    if (params.options !== undefined) record(params.options, 'options');
    // Journal validates bounded strings and JSON without trimming the exact task bytes.
    return journal.prepare(params as unknown as CbDispatchInput);
  }
}
