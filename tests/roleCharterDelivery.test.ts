import { expect, it } from 'vitest';
import { planRoleCharterInitialization as plan, type CharterRecipient } from '../src/roleCharterDelivery';
import type { SendAttemptRecord } from '../src/contracts';
const recipient: CharterRecipient = { identity: 'joint-chief', role: 'chief_engineer', project: 'group:cb-hive-joint-development', conversationKey: 'conversation:chief', version: 'v1', digest: 'a'.repeat(64), content: 'Approved charter' };
const runtime = { controlled: true, leaseValid: true, conversationKey: recipient.conversationKey };
it('requires a controlled exact Conversation and lease, including Chief', () => {
  for (const observed of [{ ...runtime, controlled: false }, { ...runtime, leaseValid: false }, { ...runtime, conversationKey: 'conversation:ordinary' }]) {
    expect(plan(recipient, [], [], observed, 1)).toEqual({ state: 'PENDING_RUNTIME' });
  }
});
it('freezes one recipient and reuses durable messages across restart', () => {
  const first = plan(recipient, [], [], runtime, 1);
  expect(first.message?.recipientConversationKeys).toEqual([recipient.conversationKey]);
  expect(plan(recipient, [first.message!], [], runtime, 2)).toEqual({ state: 'prepared' });
  expect(plan(recipient, [], [], runtime, 3).message?.id).toBe(first.message?.id);
});
it('never blindly retries consumed, failed or uncertain attempts, including orphan attempts', () => {
  const message = plan(recipient, [], [], runtime, 1).message!;
  for (const [state, expected] of [['prepared', 'prepared'], ['dispatched', 'sent'], ['acknowledged', 'sent'], ['reply-observed', 'reply-observed'], ['uncertain', 'uncertain'], ['failed', 'failed']] as const) {
    const attempt: SendAttemptRecord = { attemptId: 'a', batchId: 'b', tabId: 1, conversationKey: recipient.conversationKey, contentEpoch: 'e', messageId: message.id, state, textLength: 1, baselineAssistantMessageCount: 0, createdAt: 1, updatedAt: 2 };
    expect(plan(recipient, [], [attempt], runtime, 3)).toEqual({ state: expected });
  }
});
