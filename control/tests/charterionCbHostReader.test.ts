import { expect, it, vi } from 'vitest';
import { createCbHostReader, type CbHostReaderConfig, type HostMcpTransport } from '../src/charterionCbHostReader';
function fixture() {
  const config: CbHostReaderConfig = { enabled: true, endpoint: 'https://cb.example/mcp',
    allowedEndpoints: ['https://cb.example/mcp'], token: 'fixture-private-token', clientId: 'client',
    instanceId: 'instance', project: 'project', eventPageMax: 10, deadlineMs: 30, maxResponseBytes: 65536 };
  const ack = { found: true, task: { id: 'task', status: 'done', project: 'project', integration: {
    protocol_version: 'charterion-cb/1.0', instance_id: 'instance', client_id: 'client', dispatch_id: 'dispatch',
    work_item_id: 'work', intent_sha256: 'a'.repeat(64) } } };
  const caps = { protocol_version: 'charterion-cb/1.0', instance_id: 'instance', release_sha: null,
    features: ['request_lookup', 'task_events'], limits: { result_max_bytes: 100, chunk_max_bytes: 50,
      event_page_max: 10, liveness_stale_seconds: 60 } };
  const page = { events: [], next_seq: 0, last_seq: 0, has_more: false };
  const transport: HostMcpTransport = { connect: vi.fn(async () => {}), close: vi.fn(async () => {}),
    listTools: vi.fn(async () => ({ tools: ['get_capabilities', 'get_task_by_request', 'get_task_events'].map(name => ({ name })) })),
    callTool: vi.fn(async name => ({ structuredContent: name === 'get_capabilities' ? caps : name === 'get_task_by_request' ? ack : page })) };
  return { config, transport, ack, caps, page };
}
it('defaults off; rejects non-allowlisted endpoints and requires a genuine MCP adapter', async () => {
  const { config, transport } = fixture();
  await expect(createCbHostReader()).rejects.toThrow('CB_HOST_DISABLED');
  await expect(createCbHostReader({ ...config, endpoint: 'https://other.example/mcp' }, transport)).rejects.toThrow('CB_HOST_CONFIG_INVALID');
  expect(transport.connect).not.toHaveBeenCalled();
  await expect(createCbHostReader(config)).rejects.toThrow('CB_MCP_ADAPTER_REQUIRED');
});
it('blocks legacy tools, absent/disabled features, wrong version and invalid limits', async () => {
  const legacy = fixture();
  legacy.transport.listTools = async () => ({ tools: ['submit_task', 'get_status', 'get_result'].map(name => ({ name })) });
  await expect(createCbHostReader(legacy.config, legacy.transport)).rejects.toThrow('BLOCKED_CAPABILITY');
  expect(legacy.transport.callTool).not.toHaveBeenCalled();
  for (const change of [{ features: [] }, { protocol_version: 'old' }, { limits: { event_page_max: 0 } }]) {
    const f = fixture(); Object.assign(f.caps, change);
    await expect(createCbHostReader(f.config, f.transport)).rejects.toThrow('BLOCKED_CAPABILITY');
  }
});
it('401 and deadline fail closed without leaking errors or retrying', async () => {
  for (const timeout of [false, true]) {
    const f = fixture();
    f.transport.connect = vi.fn(() => timeout ? new Promise<void>(() => {}) : Promise.reject(new Error('401 ' + f.config.token)));
    await expect(createCbHostReader(f.config, f.transport)).rejects.toThrow(/^CB_READ_UNAVAILABLE$/);
    expect(f.transport.connect).toHaveBeenCalledTimes(1);
    expect(f.transport.callTool).not.toHaveBeenCalled();
  }
});
it('valid capability and repeated query responses never submit or expose credentials', async () => {
  const f = fixture(), reader = await createCbHostReader(f.config, f.transport);
  for (let i = 0; i < 2; i++) {
    expect(await reader.get_task_by_request('client', 'dispatch')).toEqual(f.ack);
    expect(await reader.get_task_events('task', 0, 10)).toEqual(f.page);
  }
  expect(Object.keys(reader)).toEqual(['get_task_by_request', 'get_task_events']);
  const calls = vi.mocked(f.transport.callTool).mock.calls;
  expect(calls.map(c => c[0])).toEqual(['get_capabilities', 'get_task_by_request', 'get_task_events', 'get_task_by_request', 'get_task_events']);
  expect(JSON.stringify(calls)).not.toContain(f.config.token);
});
it('validates caller scope and server identity even with mocked transport', async () => {
  const f = fixture(), reader = await createCbHostReader(f.config, f.transport);
  await expect(reader.get_task_by_request('other', 'dispatch')).rejects.toThrow('CB_SCOPE_MISMATCH');
  await expect(reader.get_task_events('unbound', 0, 1)).rejects.toThrow('CB_SCOPE_MISMATCH');
  f.ack.task.integration.instance_id = 'other';
  await expect(reader.get_task_by_request('client', 'dispatch')).rejects.toThrow('CB_SCOPE_MISMATCH');
  f.ack.task.integration.instance_id = 'instance';
  await reader.get_task_by_request('client', 'dispatch');
  Object.assign(f.page, { events: [{ instance_id: 'other', task_id: 'task' }] });
  await expect(reader.get_task_events('task', 0, 1)).rejects.toThrow('CB_SCOPE_MISMATCH');
});
it('sanitizes server errors and secret-bearing success payloads', async () => {
  const f = fixture(), reader = await createCbHostReader(f.config, f.transport);
  f.transport.callTool = async () => { throw new Error('unused mutation'); };
  Object.assign(f.ack.task, { extra: f.config.token });
  await expect(reader.get_task_by_request('client', 'dispatch')).rejects.toThrow(/^CB_RESPONSE_INVALID$/);
});
