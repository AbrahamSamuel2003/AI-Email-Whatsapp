# AI Email → WhatsApp Reply System

An intelligent executive assistant that synchronizes emails, filters important correspondence using AI, notifies you via WhatsApp, converts natural-language WhatsApp replies into polished professional email drafts, and delivers replies inside the original email conversation with full thread preservation.

---

## 🏗️ Architecture & Core Flow

```
Incoming Email (Gmail/Mock)
       │
       ▼
Email Ingestion Pipeline
       │
       ▼
AI Importance Filter (Gemini / Mock)
       ├── NOT IMPORTANT ──▶ Ignored silently (No spam to WhatsApp)
       └── IMPORTANT
              │
              ▼
       WhatsApp Notification ──▶ Client reads on WhatsApp
                                         │
                                         ▼
                                   Client replies:
                             "Tomorrow 11 is fine"
                                         │
                                         ▼
       AI Professional Reply Engine (Generates Draft)
                                         │
                                         ▼
       WhatsApp Draft Preview ──▶ [SEND] / [EDIT]
                                         │
                                         ▼
                                   Client confirms:
                                       "SEND"
                                         │
                                         ▼
       Email Sender (Gmail / Mock)
       Preserves RFC 2822: In-Reply-To, References, Subject Re:, Thread ID
```

---

## 🗄️ Database Schema (Prisma)

* **`User`**: Client identity, contact email, and linked WhatsApp number.
* **`EmailAccount`**: OAuth credentials (encrypted via AES-256-GCM), sync cursor, and provider metadata.
* **`EmailThread`**: Groups conversations by external thread ID (`threadId`) to maintain conversational continuity.
* **`EmailMessage`**: Message body, sender metadata, RFC Message-ID, AI importance score, urgency, and reasoning.
* **`WhatsappSession`**: Real-time state machine (`IDLE` ➔ `NOTIFIED` ➔ `PREVIEW_GENERATED` ➔ `CONFIRMED_SENT`) mapping WhatsApp numbers to active email threads and pending draft previews.
* **`OutboundEmail`**: Audit trail of AI-synthesized replies dispatched to external mail servers.

---

## 🚀 Quick Start & Simulation

### 1. Install & Setup Database
```bash
npm install
npm run prisma:push
```

### 2. Run the Automated 8-Step Verification Scenario
Runs the complete simulated end-to-end pipeline:
```bash
npm run simulate:auto
```

### 3. Run the Interactive CLI Simulator
Interact in real-time in your terminal:
```bash
npm run simulate
```

### 4. Run the Test Suite
```bash
npm test
```

### 5. Start the Webhook & API Server
```bash
npm start
```
* **Health Check:** `GET http://localhost:3000/health`
* **System Status:** `GET http://localhost:3000/api/status`
* **WhatsApp Webhook:** `GET / POST http://localhost:3000/webhooks/whatsapp`
* **Gmail Push Webhook:** `POST http://localhost:3000/webhooks/gmail`
* **Simulate Email Ingestion API:** `POST http://localhost:3000/api/simulate/email`

---

## 🔌 Switching to Live Mode (Gemini / Gmail / WhatsApp)

Edit `.env` with your real keys:

1. **AI (Gemini):**
   ```env
   AI_PROVIDER=gemini
   GEMINI_API_KEY=your_gemini_api_key
   ```
2. **WhatsApp (Meta Cloud API):**
   ```env
   WHATSAPP_PROVIDER=cloud_api
   WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
   WHATSAPP_ACCESS_TOKEN=your_permanent_access_token
   WHATSAPP_VERIFY_TOKEN=your_verify_token
   ```
3. **Gmail:**
   ```env
   EMAIL_PROVIDER=gmail
   GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your_client_secret
   ```
4. **BullMQ / Redis (Optional production queue):**
   ```env
   USE_REDIS_QUEUE=true
   REDIS_HOST=127.0.0.1
   REDIS_PORT=6379
   ```
