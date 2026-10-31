import type { AgentMessage, SendAttemptRecord } from './contracts';

export type CharterDeliveryState = 'prepared' | 'sent' | 'reply-observed' | 'failed' | 'uncertain' | 'PENDING_RUNTIME';
export interface CharterRecipient {
  identity: string;
  role: 'chief_engineer' | 'developer';
  project: string;
  conversationKey: string;
  version: string;
  digest: string;
  content: string;
}

/** Projection over the existing durable message/attempt ledger; never sends.
 * Unknown runtime and uncertain delivery are fail-closed. A missing message
 * referenced by an attempt is still consumed, preventing crash-window replay.
 */
export function planRoleCharterInitialization(
  recipient: CharterRecipient,
  messages: readonly AgentMessage[],
  attempts: readonly SendAttemptRecord[],
  runtime: { controlled: boolean; conversationKey: string; leaseValid: boolean },
  now: number,
): { state: CharterDeliveryState; message?: AgentMessage } {
  if (!/^[a-f0-9]{64}$/.test(recipient.digest) || !recipient.version || !recipient.identity || !recipient.conversationKey.startsWith('conversation:')) {
    throw new Error('Invalid effective role charter reference');
  }
  const id = `role-charter:${JSON.stringify([recipient.identity, recipient.conversationKey, recipient.version, recipient.digest])}`;
  const previous = messages.find(message => message.id === id);
  if (previous && (previous.content !== recipient.content || previous.recipientConversationKeys?.length !== 1 || previous.recipientConversationKeys[0] !== recipient.conversationKey)) {
    throw new Error('Role charter message tampering');
  }
  const history = attempts.filter(attempt => attempt.messageId === id || previous?.attemptIds.includes(attempt.attemptId));
  if (history.some(attempt => attempt.conversationKey !== recipient.conversationKey)) throw new Error('Cross-conversation charter attempt');
  if (history.some(attempt => attempt.state === 'reply-observed')) return { state: 'reply-observed' };
  if (history.some(attempt => attempt.state === 'uncertain')) return { state: 'uncertain' };
  if (history.some(attempt => attempt.state === 'dispatched' || attempt.state === 'acknowledged')) return { state: 'sent' };
  if (history.some(attempt => attempt.state === 'prepared')) return { state: 'prepared' };
  // No automatic failed-attempt retry: reliable history reconciliation is required.
  if (history.length) return { state: 'failed' };
  if (previous) return { state: 'prepared' };
  if (!runtime.controlled || !runtime.leaseValid || runtime.conversationKey !== recipient.conversationKey) return { state: 'PENDING_RUNTIME' };
  return { state: 'prepared', message: {
    id, project: recipient.project, fromRole: 'role-charter', target: { kind: 'role', role: recipient.role },
    type: 'announcement', content: recipient.content, recipientConversationKeys: [recipient.conversationKey],
    attemptIds: [], createdAt: now, updatedAt: now,
  } };
}
