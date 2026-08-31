import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { ImapSmtpAdapter } from '../services/email/imap-smtp.adapter.js';
import { encryptToken } from '../services/crypto/encryption.js';

async function testZohoLive() {
  const email = process.env.TEST_EMAIL || 'support@ss40network.com';
  const password = process.env.TEST_PASSWORD || '';
  if (!password) {
    console.log('Please provide TEST_PASSWORD env variable to run live simulation.');
    return;
  }
  const encryptedPassword = encryptToken(password);

  console.log(`\n========================================`);
  console.log(`Testing Live Connection for: ${email}`);
  console.log(`========================================`);

  // Test 1: Direct IMAP handshake with verbose error
  console.log(`\n[1/2] Probing Zoho India IMAP (imap.zoho.in:993)...`);
  const client = new ImapFlow({
    host: 'imap.zoho.in',
    port: 993,
    secure: true,
    auth: {
      user: email,
      pass: password,
    },
    logger: false,
  });

  try {
    await client.connect();
    console.log(`✅ IMAP Connected successfully!`);
    await client.logout();
  } catch (err: any) {
    console.log(`❌ IMAP Error: ${err.message}`);
    if (err.responseText) console.log(`   Server Response: ${err.responseText}`);
    if (err.responseStatus) console.log(`   Response Status: ${err.responseStatus}`);
  }

  // Test 2: Direct SMTP handshake with verbose error
  console.log(`\n[2/2] Probing Zoho India SMTP (smtp.zoho.in:465)...`);
  const transporter = nodemailer.createTransport({
    host: 'smtp.zoho.in',
    port: 465,
    secure: true,
    auth: {
      user: email,
      pass: password,
    },
    tls: { rejectUnauthorized: false },
  });

  try {
    await transporter.verify();
    console.log(`✅ SMTP Verified successfully!`);
  } catch (err: any) {
    console.log(`❌ SMTP Error: ${err.message}`);
    if (err.response) console.log(`   Server Response: ${err.response}`);
  }
}

testZohoLive().catch(console.error);
