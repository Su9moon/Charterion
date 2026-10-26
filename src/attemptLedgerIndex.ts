import type { ChatSnapshot, SendAttemptRecord } from './contracts';

interface IndexedAttempt {
  attempt: SendAttemptRecord;
  ordinal: number;
}

export interface AttemptLedgerIndex {
  latestFor(tabId: number, snapshot: ChatSnapshot): SendAttemptRecord | undefined;
}

export function createAttemptLedgerIndex(attempts: readonly SendAttemptRecord[]): AttemptLedgerIndex {
  const byTab = new Map<number, IndexedAttempt>();
  const byConversation = new Map<string, IndexedAttempt>();

  attempts.forEach((attempt, ordinal) => {
    const indexed = { attempt, ordinal };
    byTab.set(attempt.tabId, indexed);
    byConversation.set(attempt.conversationKey, indexed);
  });

  return {
    latestFor(tabId, snapshot) {
      // A physical tab may display many different ChatGPT conversations.
      // Never show a previous conversation's attempt as this one's last send.
      if (snapshot.conversationId) {
        return byConversation.get(snapshot.conversationKey)?.attempt;
      }
      const inTab = byTab.get(tabId)?.attempt;
      return inTab?.conversationKey === snapshot.conversationKey ? inTab : undefined;
    },
  };
}
