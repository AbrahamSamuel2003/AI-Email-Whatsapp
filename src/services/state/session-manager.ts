import { prisma } from '../../db/prisma.js';
import { WhatsAppSessionState } from '../../core/types.js';

export class SessionManager {
  /**
   * Finds or creates a WhatsApp session for a given phone number
   */
  static async getOrCreateSession(whatsappNumber: string) {
    let session = await prisma.whatsappSession.findUnique({
      where: { whatsappNumber },
      include: {
        user: {
          include: {
            emailAccounts: true,
          },
        },
      },
    });

    if (!session) {
      // Find or create default user for this WhatsApp number
      let user = await prisma.user.findUnique({
        where: { whatsappNumber },
        include: { emailAccounts: true },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            name: 'Client',
            email: 'client@company.com',
            whatsappNumber,
            emailAccounts: {
              create: {
                provider: 'MOCK',
                emailAddress: 'client@company.com',
              },
            },
          },
          include: { emailAccounts: true },
        });
      }

      session = await prisma.whatsappSession.create({
        data: {
          userId: user.id,
          whatsappNumber,
          state: 'IDLE',
        },
        include: {
          user: {
            include: {
              emailAccounts: true,
            },
          },
        },
      });
    }

    return session;
  }

  /**
   * Updates session state when a new important email is notified to WhatsApp
   */
  static async setNotifiedState(
    whatsappNumber: string,
    threadId: string,
    messageId: string
  ) {
    const session = await this.getOrCreateSession(whatsappNumber);
    return prisma.whatsappSession.update({
      where: { id: session.id },
      data: {
        state: 'NOTIFIED',
        activeThreadId: threadId,
        activeMessageId: messageId,
        generatedDraft: null,
        lastClientText: null,
      },
    });
  }

  /**
   * Updates session when AI generates a preview draft for client approval
   */
  static async setPreviewGeneratedState(
    whatsappNumber: string,
    draftText: string,
    clientInstruction: string
  ) {
    const session = await this.getOrCreateSession(whatsappNumber);
    return prisma.whatsappSession.update({
      where: { id: session.id },
      data: {
        state: 'PREVIEW_GENERATED',
        generatedDraft: draftText,
        lastClientText: clientInstruction,
      },
    });
  }

  /**
   * Resets session state after the email is sent
   */
  static async setConfirmedSentState(whatsappNumber: string) {
    const session = await this.getOrCreateSession(whatsappNumber);
    return prisma.whatsappSession.update({
      where: { id: session.id },
      data: {
        state: 'CONFIRMED_SENT',
        generatedDraft: null,
      },
    });
  }

  /**
   * Resets session to IDLE
   */
  static async resetSession(whatsappNumber: string) {
    const session = await this.getOrCreateSession(whatsappNumber);
    return prisma.whatsappSession.update({
      where: { id: session.id },
      data: {
        state: 'IDLE',
        activeThreadId: null,
        activeMessageId: null,
        generatedDraft: null,
        lastClientText: null,
      },
    });
  }
}
