import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../db/prisma.js';
import { ImapSmtpService } from '../services/email/imap-smtp.service.js';
import { ImapSmtpAdapter } from '../services/email/imap-smtp.adapter.js';
import { encryptToken, decryptToken } from '../services/crypto/encryption.js';

test('Universal IMAP & SMTP Service - Test Suite', async (t) => {
  await t.test('1. Auto-detects server settings for Zoho, Outlook, and Custom domains', async () => {
    const zohoIndia = await ImapSmtpService.detectServerPreset('ceo@mycompany.zoho.in');
    assert.equal(zohoIndia.imapHost, 'imap.zoho.in');
    assert.equal(zohoIndia.smtpHost, 'smtp.zoho.in');
    assert.equal(zohoIndia.smtpPort, 465);

    const zohoGlobal = await ImapSmtpService.detectServerPreset('sales@company.zoho.com');
    assert.equal(zohoGlobal.imapHost, 'imap.zoho.com');
    assert.equal(zohoGlobal.smtpHost, 'smtp.zoho.com');
    assert.equal(zohoGlobal.smtpPort, 465);

    const outlook = await ImapSmtpService.detectServerPreset('director@office365.com');
    assert.equal(outlook.imapHost, 'outlook.office365.com');
    assert.equal(outlook.smtpHost, 'smtp.office365.com');
    assert.equal(outlook.smtpPort, 587);

    const custom = await ImapSmtpService.detectServerPreset('admin@hospital.org');
    assert.equal(custom.imapHost, 'mail.hospital.org');
    assert.equal(custom.smtpHost, 'mail.hospital.org');
  });

  await t.test('2. Encrypts and decrypts IMAP/SMTP app passwords using AES-256-GCM', () => {
    const rawSecret = 'zoho-app-pass-9921';
    const encrypted = encryptToken(rawSecret);
    assert.notEqual(encrypted, rawSecret);

    const decrypted = decryptToken(encrypted);
    assert.equal(decrypted, rawSecret);
  });

  await t.test('3. Database schema persists IMAP_SMTP email account correctly', async () => {
    const testPhone = '+919888877777';
    const testEmail = 'exec@customdomain.com';

    // Clean any prior residue
    await prisma.emailAccount.deleteMany({ where: { emailAddress: testEmail } }).catch(() => {});
    await prisma.user.deleteMany({ where: { whatsappNumber: testPhone } }).catch(() => {});

    const user = await prisma.user.create({
      data: {
        name: 'Custom Domain Executive',
        email: testEmail,
        whatsappNumber: testPhone,
      },
    });

    const encryptedPass = encryptToken('my-secret-app-password');

    const account = await prisma.emailAccount.create({
      data: {
        userId: user.id,
        provider: 'IMAP_SMTP',
        emailAddress: testEmail,
        imapHost: 'imap.zoho.in',
        imapPort: 993,
        imapUser: testEmail,
        smtpHost: 'smtp.zoho.in',
        smtpPort: 465,
        smtpUser: testEmail,
        encryptedPassword: encryptedPass,
      },
    });

    assert.equal(account.provider, 'IMAP_SMTP');
    assert.equal(account.imapHost, 'imap.zoho.in');
    assert.equal(account.smtpHost, 'smtp.zoho.in');
    assert.equal(account.smtpPort, 465);
    assert.equal(decryptToken(account.encryptedPassword!), 'my-secret-app-password');

    // Clean up test data
    await prisma.emailAccount.delete({ where: { id: account.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
