import { readNativeControlSnapshot, reportNativeAgentBrowser, reportNativeAgentRuntime, reportNativeIncident } from './nativeControl';
import type { ChatSnapshot, ContentObservationIdentity, RoleBinding } from './contracts';
import { extractConversationId } from './chatgptAdapter';

/** Local bindings are projections of the Kernel's project/role identity. */
export async function confirmRoleBinding(tabId: number, snapshot: ChatSnapshot, binding: RoleBinding, provisionalKey?: string): Promise<boolean> {
  try { if (new URL(snapshot.url).origin !== 'https://chatgpt.com') return false; } catch { return false; }
  if (!binding.agentSlotId || !binding.projectId) return false;
  const control = await readNativeControlSnapshot();
  const agent = control.agents.find((item) => item.id === binding.agentSlotId);
  const project = control.projects.find((item) => item.id === binding.projectId);
  if (!agent || !project || agent.projectId !== project.id || project.name !== binding.project || agent.role !== binding.role ||
      agent.desiredState !== 'active' || agent.browserTabId !== tabId || !agent.browserLeaseId) return false;
  if (!snapshot.conversationKey.startsWith('conversation:')) return !agent.conversationKey;
  const id = extractConversationId(snapshot.url);
  if (!id || snapshot.conversationId !== id || snapshot.conversationKey !== `conversation:${id}`) return false;
  if (agent.conversationKey === snapshot.conversationKey) return true;
  if (agent.conversationKey || !provisionalKey) return false;
  // The Kernel checks the explicit one-shot authorization and dispatched
  // provisional prompt. Never write the local projection before it accepts.
  await reportNativeAgentBrowser({ slotId: agent.id, profileId: agent.browserProfileId ?? 'gam-default', browserState: 'open',
    tabId, conversationKey: snapshot.conversationKey, observedAt: Date.now() });
  return true;
}

export async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function reportIncident(
  code: string,
  subject: string,
  detail: Record<string, unknown>,
  severity: 'warning' | 'error' | 'critical' = 'error',
): Promise<void> {
  try {
    await reportNativeIncident({ scope: 'browser-extension', severity, code, subject, detail });
  } catch {
    // Incident transport failures cannot recursively report themselves.
  }
}

export async function reportSlotRuntime(
  tabId: number,
  observation: ContentObservationIdentity,
  snapshot: ChatSnapshot,
  resolveBinding: (tabId: number, snapshot: ChatSnapshot) => Promise<RoleBinding>,
): Promise<RoleBinding> {
  const binding = await resolveBinding(tabId, snapshot);
  if (!binding.agentSlotId) return binding;
  await reportNativeAgentRuntime({
    slotId: binding.agentSlotId,
    profileId: 'gam-default',
    tabId,
    contentEpoch: observation.contentEpoch,
    revision: observation.revision,
    pageStatus: snapshot.status,
    semanticSignature: observation.semanticSignature,
    observedAt: observation.observedAt,
  });
  return binding;
}
