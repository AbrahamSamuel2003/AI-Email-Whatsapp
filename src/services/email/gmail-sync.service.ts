import { prisma } from '../../db/prisma.js';
import { GmailAuthService } from './gmail-auth.service.js';
import { GmailAdapter } from './gmail.adapter.js';
import { TaskQueueManager } from '../../queue/task-queue.js';
import { IngestionResult } from './ingestion-pipeline.js';

export class GmailSyncService {
  /**
   * Syncs recent messages from a connected Gmail EmailAccount
   */
  static async syncRecentEmails(
    emailAccountId: string,
    maxEmails: number = 10
  ): Promise<{ syncedCount: number; messageIds: string[] }> {
    const account = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      include: { user: true },
    });

    if (!account) {
      throw new Error(`EmailAccount ${emailAccountId} not found`);
    }

    const authClient = await GmailAuthService.getAuthenticatedClientForAccount(account.id);
    const gmailAdapter = new GmailAdapter(authClient);

    const messageIds = await gmailAdapter.listRecentMessages('label:INBOX', maxEmails);
    const processedIds: string[] = [];

    for (const msgId of messageIds) {
      try {
        const metadata = await gmailAdapter.fetchMessage(msgId);
        await TaskQueueManager.enqueueEmail(metadata);
        processedIds.push(msgId);
      } catch (err: any) {
        console.error(`Failed to ingest Gmail message ${msgId}:`, err.message);
      }
    }

    return {
      syncedCount: processedIds.length,
      messageIds: processedIds,
    };
  }

  /**
   * Handles push notification history delta sync
   */
  static async handleHistoryPush(
    emailAddress: string,
    newHistoryId: string
  ): Promise<{ syncedCount: number }> {
    const account = await prisma.emailAccount.findFirst({
      where: { emailAddress, provider: 'GMAIL' },
    });

    if (!account) {
      console.warn(`No Gmail account registered for email ${emailAddress}`);
      return { syncedCount: 0 };
    }

    const authClient = await GmailAuthService.getAuthenticatedClientForAccount(account.id);
    const gmailAdapter = new GmailAdapter(authClient);

    const startHistoryId = account.syncCursor || newHistoryId;
    let newMsgIds: string[] = [];

    try {
      if (account.syncCursor) {
        newMsgIds = await gmailAdapter.fetchHistoryDeltas(startHistoryId);
      } else {
        newMsgIds = await gmailAdapter.listRecentMessages('label:INBOX', 5);
      }
    } catch (err: any) {
      console.warn(`History sync failed, falling back to recent inbox list:`, err.message);
      newMsgIds = await gmailAdapter.listRecentMessages('label:INBOX', 5);
    }

    // Update sync cursor
    await prisma.emailAccount.update({
      where: { id: account.id },
      data: { syncCursor: newHistoryId },
    });

    for (const msgId of newMsgIds) {
      try {
        const metadata = await gmailAdapter.fetchMessage(msgId);
        await TaskQueueManager.enqueueEmail(metadata);
      } catch (err: any) {
        console.error(`Error processing history delta message ${msgId}:`, err.message);
      }
    }

    return { syncedCount: newMsgIds.length };
  }

  /**
   * Enables Gmail mailbox watch with Google Cloud Pub/Sub
   */
  static async enableMailboxWatch(
    emailAccountId: string,
    topicName: string
  ): Promise<{ historyId: string; expiration: string }> {
    const account = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
    });

    if (!account) {
      throw new Error(`EmailAccount ${emailAccountId} not found`);
    }

    const authClient = await GmailAuthService.getAuthenticatedClientForAccount(account.id);
    const gmailAdapter = new GmailAdapter(authClient);
    const watchResult = await gmailAdapter.watchMailbox(topicName);

    await prisma.emailAccount.update({
      where: { id: account.id },
      data: { syncCursor: watchResult.historyId },
    });

    return watchResult;
  }
}
