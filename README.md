# 🌐 SS40 Network — AI Email to WhatsApp Executive Assistant

An enterprise-grade AI Executive Assistant that connects multiple business email accounts (Google Workspace, Zoho Mail, Outlook, Custom IMAP/SMTP), monitors inboxes in real-time, filters spam and promotional noise, passes through critical OTP/2FA security alerts, and sends important email notifications directly to WhatsApp. Users can review emails, dictate natural-language replies (via voice notes or text in English, Tamil, Tanglish, Hindi), preview AI-synthesized corporate drafts, and dispatch RFC 2822-compliant replies directly from WhatsApp.

---

## 🎯 Core Goal & Workflow

```
Incoming Email (Gmail / Zoho / Custom IMAP)
                   │
                   ▼
       Email Ingestion Pipeline
                   │
                   ▼
       AI Multi-Tier Classification (Groq / Gemini)
       ├── 🚫 SPAM / PROMOTIONS ──────────────▶ Ignored Silently
       ├── 🔐 OTP / SECURITY ALERTS ──────────▶ Dispatched as ALERT_ONLY (Non-Actionable)
       └── 💼 IMPORTANT BUSINESS EMAIL
                   │
                   ▼
       WhatsApp Notification ─────────────────▶ Real-Time Alert to Executive WhatsApp
                                                          │
                                                          ▼
                                              Executive replies via Text or Voice:
                                              "Naalaiku 11 mani ok, schedule pannidunga"
                                                          │
                                                          ▼
       Groq / Gemini Corporate Drafter (Transforms natural instruction into polished English)
                                                          │
                                                          ▼
       WhatsApp Draft Preview ────────────────▶ Executive reviews draft
                                                          │
                                                          ▼
                                              Executive confirms: "SEND"
                                                          │
                                                          ▼
       Outbound Mail Adapter (Gmail / SMTP)
       Preserves RFC 2822 Headers: In-Reply-To, References, Subject Re:, Thread Continuity
```

---

## ✨ Key Features & Capabilities

### 1. 📬 Multi-Mailbox Gatekeeper & Isolation
* **Universal Provider Support:** Connect unlimited Google Workspace / Gmail accounts (via 1-click OAuth 2.0) and Custom Domains / Zoho / Outlook (via secure IMAP/SMTP TLS).
* **Strict Mailbox Scoping:** Numbered email selection (`1`, `2`, `3`) is strictly isolated to the active mailbox. No email cross-contamination.
* **Instant Mailbox Switcher:** Send `SWITCH` or reply with mailbox numbers from the `HI` dashboard to toggle between active monitoring mailboxes.

### 2. 🤖 Multi-Tier AI Architecture & Voice Recognition
* **Failover Engine:** Primary LLM (Groq LLaMA 3.3 70B / 8B) with automatic failover to **Google Gemini 2.0 Flash**, and local deterministic templates if offline.
* **Whisper AI Voice Transcription:** Supports voice notes in English, Tamil (தமிழ்), Tanglish, Hindi (हिन्दी), and Hinglish.
* **Multi-Language Preference:** Customize output notification language using `SET LANGUAGE TAMIL`, `SET LANGUAGE HINDI`, or `SET LANGUAGE ENGLISH`.

### 3. 🔐 Security & OTP Pass-Through
* Instant detection and extraction of 2FA codes, login OTPs, and password reset alerts.
* Tagged as `ALERT_ONLY` so they never clutter your actionable reply queue.

### 4. 📲 Resilient WhatsApp Integration
* **Baileys Web Socket:** Built-in QR scanner and 8-Digit Pairing Code support with single-click session resets.
* **Meta Cloud API Support:** Ready for official WhatsApp Business API integration.

### 5. 🎨 Modern SS40 Network Onboarding Portal
* Dedicated web dashboard running at `http://localhost:3005` featuring:
  - Step 1: User Profile Configuration
  - Step 2: 1-Click Google Sign-in & Universal IMAP/SMTP Connect
  - Step 3: Live WhatsApp QR & 8-Digit Pairing Code with instant disconnect/reset
  - Step 4: System Health & On-Demand Welcome Test Button

---

## 💬 WhatsApp Commands & Interaction Guide

| Command | Action |
| :--- | :--- |
| **`HI` / `HELLO` / `HELP`** | Displays the unified executive dashboard, connected mailboxes, active status, and instructions. |
| **`1`, `2`, `3`** | Directly selects and opens a numbered mailbox (from `HI` or `SWITCH`), or selects an email from `CHECK MAIL`. |
| **`CHECK MAIL` / `STATUS`** | Scans the active mailbox and lists unreplied actionable emails. |
| **`1 FULL` / `READ 1`** | Opens and displays the full unabridged email body for email #1. |
| **Voice Note / Text** | Dictate a reply in any language (English, Tanglish, Tamil, Hindi) to generate a corporate English draft. |
| **`SEND` / `PROCEED`** | Approves and dispatches the active draft into the exact email thread. |
| **`CANCEL` / `RESET`** | Instantly discards the active draft and returns the assistant to `IDLE` state. |
| **`SWITCH`** | Lists all connected mailboxes and prompts for active mailbox selection. |
| **`SET LANGUAGE <LANG>`** | Sets your preferred summary language (`TAMIL`, `HINDI`, or `ENGLISH`). |
| **`SUPPORT` / `WEBSITE`** | Displays SS40 Network contact channels, support email, and portal URL. |
| **`IGNORE` / `IGNORE ALL`** | Skips the current email or clears all pending email reviews. |

---

## 🛠️ Tech Stack

* **Runtime:** Node.js (v20+ / v22+) & TypeScript
* **Server Framework:** Fastify
* **Database & ORM:** SQLite / PostgreSQL with Prisma ORM
* **WhatsApp Engine:** `@whiskeysockets/baileys` & Meta Cloud API
* **Email Protocols:** Google APIs (`googleapis`), `imapflow`, and `nodemailer`
* **AI Providers:** Groq SDK, `@google/genai` (Gemini 2.0), OpenAI Whisper
* **Encryption:** AES-256-GCM for tokens and app-passwords

---

## 🚀 Getting Started

### 1. Installation
```bash
git clone https://github.com/AbrahamSamuel2003/AI-Email-Whatsapp.git
cd AI-Email-Whatsapp
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root directory:

```env
PORT=3005
NODE_ENV=development
CLIENT_WHATSAPP_NUMBER=+916383813648
ENCRYPTION_SECRET=your_32_byte_hex_encryption_key_here

# AI Configuration
AI_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key

# WhatsApp Provider (baileys or cloud_api)
WHATSAPP_PROVIDER=baileys

# Google OAuth 2.0 Credentials
EMAIL_PROVIDER=gmail
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3005/auth/google/callback

# Admin & Monitoring
ADMIN_EMAIL=support@ss40network.com
COMPANY_NAME="SS40 Network"
COMPANY_PORTAL=https://connect.ss40network.com
```

### 3. Initialize Database
```bash
npx prisma db push
```

### 4. Run the Application
```bash
npm run dev
```

Open your browser and navigate to: **[http://localhost:3005](http://localhost:3005)**

---

## 🧪 Testing & Quality Assurance

Run the comprehensive end-to-end automated test suites:

```bash
# 1. Run core system unit and integration tests
npm test

# 2. Run multi-mailbox isolation and gatekeeper tests
node --import tsx --test src/tests/multi-mailbox.test.ts

# 3. Run complete production client simulation audit (9 steps)
node --import tsx --test src/tests/e2e-production-audit.ts
```

---

## 🏢 Support & Company Information

* **Organization:** SS40 Network
* **Website:** [https://ss40network.com](https://ss40network.com)
* **Client Portal:** [https://connect.ss40network.com](https://connect.ss40network.com)
* **Support Inquiries:** [support@ss40network.com](mailto:support@ss40network.com)
