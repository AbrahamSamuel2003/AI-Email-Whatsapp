import { prisma } from '../../db/prisma.js';
import { WhatsAppSessionState } from '../../core/types.js';

export class SessionManager {
  /**
   * Finds or creates a WhatsApp session for a given phone number
   */
  static async getOrCreateSession(whatsappNumber: string) {
    const cleanNumber = whatsappNumber.replace(/\D/g, '');
    const formattedNumber = `+${cleanNumber}`;

    // 1. Find user by either format (+91... or 91... or exact)
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { whatsappNumber: formattedNumber },
          { whatsappNumber: cleanNumber },
          { whatsappNumber },
        ],
      },
      include: {
        emailAccounts: true,
      },
    });

    if (!user) {
      const defaultEmail = `client-${cleanNumber || Date.now()}@company.com`;
      user = await prisma.user.create({
        data: {
          name: 'Client',
          email: defaultEmail,
          whatsappNumber: formattedNumber,
          emailAccounts: {
            create: {
              provider: 'MOCK',
              emailAddress: defaultEmail,
            },
          },
        },
        include: {
          emailAccounts: true,
        },
      });
    }

    // 2. Find existing session by userId OR whatsappNumber
    let session = await prisma.whatsappSession.findFirst({
      where: {
        OR: [
          { userId: user.id },
          { whatsappNumber: formattedNumber },
          { whatsappNumber: cleanNumber },
          { whatsappNumber },
        ],
      },
      include: {
        user: {
          include: {
            emailAccounts: true,
          },
        },
      },
    });

    if (session) {
      // Normalize number and associate to current user if needed
      if (session.whatsappNumber !== formattedNumber || session.userId !== user.id) {
        session = await prisma.whatsappSession.update({
          where: { id: session.id },
          data: {
            userId: user.id,
            whatsappNumber: formattedNumber,
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

    // 3. Create fresh session
    session = await prisma.whatsappSession.create({
      data: {
        userId: user.id,
        whatsappNumber: formattedNumber,
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
        activeThreadId: null,
        activeMessageId: null,
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
