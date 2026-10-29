import type { ChatSnapshot } from './contracts';

export interface ReplyBaseline {
  assistantMessageCount: number;
  latestAssistantMessageId?: string;
  conversationKey?: string;
}

export function hasNewAssistantReply(snapshot: ChatSnapshot, baseline: ReplyBaseline): boolean {
  if (snapshot.status !== 'idle' || !snapshot.latestAssistantText.trim()) return false;
  // A new answer in an unrelated conversation on the same tab is NOT
  // evidence for the original attempt. Provisional->canonical transitions
  // on first send are handled separately by the browser lifecycle.
  if (baseline.conversationKey?.startsWith('conversation:') &&
      snapshot.conversationKey !== baseline.conversationKey) return false;
  if (
    snapshot.latestAssistantMessageId &&
    baseline.latestAssistantMessageId &&
    snapshot.latestAssistantMessageId !== baseline.latestAssistantMessageId
  ) {
    return true;
  }
  return snapshot.assistantMessageCount > baseline.assistantMessageCount;
}