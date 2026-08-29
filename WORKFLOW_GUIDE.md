# 📖 AI Email to WhatsApp Connect — Complete Workflow & Architecture Guide

A production-grade, provider-agnostic system that bridges **Gmail**, **Google Gemini AI**, and **WhatsApp**, enabling executives and developers to read, manage, and reply to critical emails and extract OTPs directly inside WhatsApp.

---

## 🏛️ 1. High-Level System Architecture

```text
                        ┌─────────────────────────────────────────┐
                        │      Real-Time Email Source (Gmail)     │
                        │  (OAuth 2.0 / AES-256-GCM Token Vault)  │
                        └────────────────────┬────────────────────┘
                                             │
                                             ▼
                        ┌─────────────────────────────────────────┐
                        │   Automated Smart Poller / Webhooks     │
                        │   (10s Cursor Delta & Deduplication)    │
                        └────────────────────┬────────────────────┘
                                             │
                                             ▼
                        ┌─────────────────────────────────────────┐
                        │   Google Gemini AI & Security Engine    │
                        │ (Importance, OTP Extraction & Filtering)│
                        └────────────────────┬────────────────────┘
                                             │
                                             ▼
                        ┌─────────────────────────────────────────┐
                        │        Session State Machine            │
                        │ (IDLE ➔ NOTIFIED ➔ DRAFTED ➔ SENT)      │
                        └────────────────────┬────────────────────┘
                                             │
                         IWhatsAppProvider Adapter Layer
         ┌─────────────────────────┬─────────┴───────────────┬─────────────────────────┐
         │                         │                         │                         │
   BaileysAdapter           MetaCloudAdapter           TwilioAdapter              MockAdapter
(WhatsApp Web QR Scan)   (Meta Business API)        (Twilio Sandbox)         (Unit Tests & CLI)
```

---

## 🔄 2. End-to-End Workflow Stages

### 📬 Stage 1: Email Ingestion & Deduplication
1. **Detection:** The `GmailPollerService` checks your connected mailbox every 10 seconds (or receives Google Cloud Pub/Sub push webhooks).
2. **Delta Processing:** Retrieves only new, unread emails using RFC-compliant message IDs.
3. **Database Guard:** Checks `prisma.emailMessage.findUnique({ where: { threadId_externalMessageId } })`. If an email was already ingested, it is **never re-notified**.

---

### 🧠 Stage 2: AI Classification & Security Gating
Every incoming email is evaluated by **Google Gemini (`gemini-3.6-flash`)** with resilient local heuristics fallback:

| Email Category | AI Classification | System Action | WhatsApp Behavior |
| :--- | :--- | :--- | :--- |
| **Meeting / Client Request** | `isImportant: true`<br>`notificationType: ACTIONABLE` | Session enters `NOTIFIED` state. | Sends action alert with summary and quick-reply prompt. |
| **OTP / Login Code / 2FA** | `isImportant: true`<br>`notificationType: ALERT_ONLY` | Extracts 6-digit code. Session stays `IDLE`. | Sends one-way alert with bold code (`*849201*`). Non-replyable. |
| **Promotions / Newsletters / Spam** | `isImportant: false`<br>`notificationType: NONE` | Stored silently. | Discarded. No WhatsApp notification sent. |

---

### 📱 Stage 3: WhatsApp Notification Delivery
1. The `BaileysAdapter` (or `MetaCloudAdapter`) dispatches a formatted message to your personal WhatsApp number (`CLIENT_WHATSAPP_NUMBER`).
2. **Anti-Loop Signature Protection:** The adapter records outgoing message IDs and signatures to prevent self-chat reflection loops.

**Example Notification on WhatsApp:**
```text
📧 Important Email Received

From: Internal Test (internallabexam001@gmail.com)
Subject: Project Deliverable Sync & Review

Message:
Hi Abraham, can we meet tomorrow at 11 AM to review the final project deliverable?

━━━━━━━━━━━━━━━━━━━
💬 Reply to this message with your response (e.g., "Tomorrow 11 is fine")
```

---

### ✍️ Stage 4: Informal Reply & AI Professional Drafting
1. You reply on WhatsApp in casual, quick shorthand:
   ```text
   tomorrow 11 is fine for me
   ```
2. The bot receives your text and passes it to the **AI Draft Generator**.
3. Gemini constructs a polite, context-aware corporate email draft preserving tone and recipient names.
4. Session transitions to `AWAITING_CONFIRMATION` and sends you the preview on WhatsApp:

```text
✉️ Reply Preview Draft
To: Internal Test
Subject: Re: Project Deliverable Sync & Review
━━━━━━━━━━━━━━━━━━━
Hi Internal Test,

Tomorrow at 11:00 AM works perfectly for me. We can connect and review the deliverable then.

Regards,
Abraham Samuel
━━━━━━━━━━━━━━━━━━━
👉 Reply SEND to dispatch this email.
✏️ Or type a revision to adjust the reply.
```

---

### 🚀 Stage 5: SEND Confirmation & Threaded Gmail Dispatch
1. You reply with **`SEND`** (or tap the quick-reply button).
2. The `WhatsAppReplyOrchestrator`:
   - Decrypts the stored Google OAuth access token using AES-256-GCM.
   - Formats a standard **RFC 2822** MIME email payload with `In-Reply-To` and `References` headers.
   - Dispatches the email via Google Gmail API (`users.messages.send`) directly inside the original conversation thread.
3. WhatsApp confirms delivery:
   ```text
   ✅ Email Sent Successfully!
   Delivered inside the original Gmail conversation thread.
   ```
4. Session resets to `IDLE`.

---

### 🔐 Stage 6: OTP & Security Alerts (Safety Isolated)
When login verification emails arrive (e.g. GitHub, Devin, Google):
1. Gemini classifies as `ALERT_ONLY` and extracts the verification code.
2. The alert is delivered with the code formatted in bold.
3. The session state **remains `IDLE`**. If you text back, the system safely ignores the text, preventing accidental emails from being sent to automated security senders.

---

## 🔑 3. Permanent WhatsApp Session Architecture

* **Zero Re-Scanning:** When you scan the QR code once with your phone, WhatsApp generates cryptographic tokens stored in `./baileys_auth/`.
* **Automatic Reconnect:** Whenever the server starts up (`npm run qr` or `npm start`), it auto-restores the existing session in 2 seconds.
* **Revocation:** You can disconnect at any time from your phone under **WhatsApp ➔ Settings ➔ Linked Devices ➔ Log Out**.

---

## ⚙️ 4. Configuration Reference (`.env`)

| Variable | Description | Example |
| :--- | :--- | :--- |
| `WHATSAPP_PROVIDER` | Adapter selection (`baileys`, `cloud_api`, `twilio`, `mock`) | `baileys` |
| `CLIENT_WHATSAPP_NUMBER` | Your personal WhatsApp phone number | `+916383813648` |
| `AI_PROVIDER` | AI classification engine (`gemini`, `mock`) | `gemini` |
| `AI_MODEL_NAME` | Gemini model name | `gemini-3.6-flash` |
| `EMAIL_PROVIDER` | Mailbox provider (`gmail`, `mock`) | `gmail` |
| `AUTO_SYNC_ENABLED` | Automated background polling toggle | `true` |
| `AUTO_SYNC_INTERVAL_SECONDS` | Polling frequency in seconds | `10` |

---

## 🧪 5. Testing & Diagnostics Commands

| Command | Purpose |
| :--- | :--- |
| `npm run qr` | Starts the live background server with WhatsApp QR Web bridge. |
| `npm test` | Runs the automated 7-suite unit and integration test suite. |
| `npm run test:ai` | Tests Gemini importance and security classification against real mailbox data. |
| `npm run test:whatsapp` | Verifies Meta Cloud webhook parsing and state machine dispatch. |
| `npm run simulate` | Interactive CLI console for offline testing. |
