export function getOnboardingHtml(initialPhone: string = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <meta http-equiv="Pragma" content="no-cache" />
  <meta http-equiv="Expires" content="0" />
  <title>SS40 Network — AI Email to WhatsApp Portal</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <style>
    :root {
      --bg-dark: #090d16;
      --bg-card: rgba(18, 24, 38, 0.9);
      --border-color: rgba(255, 255, 255, 0.1);
      --border-active: #38bdf8;
      --primary: #38bdf8;
      --primary-gradient: linear-gradient(135deg, #38bdf8 0%, #818cf8 50%, #c084fc 100%);
      --accent-green: #10b981;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --font-heading: 'Outfit', -apple-system, sans-serif;
      --font-body: 'Plus Jakarta Sans', -apple-system, sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background-color: var(--bg-dark);
      background-image: 
        radial-gradient(at 0% 0%, rgba(56, 189, 248, 0.12) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(129, 140, 248, 0.1) 0px, transparent 50%);
      color: var(--text-main);
      font-family: var(--font-body);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem 1rem;
    }

    .container {
      width: 100%;
      max-width: 760px;
    }

    .header {
      text-align: center;
      margin-bottom: 2rem;
    }

    .badge-live {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: 9999px;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 0.8rem;
    }

    .badge-live .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 10px #10b981;
      animation: pulse 1.8s infinite;
    }

    @keyframes pulse {
      0% { transform: scale(0.95); opacity: 0.8; }
      50% { transform: scale(1.3); opacity: 1; }
      100% { transform: scale(0.95); opacity: 0.8; }
    }

    .header h1 {
      font-family: var(--font-heading);
      font-size: 2.2rem;
      font-weight: 800;
      background: var(--primary-gradient);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.5rem;
    }

    .header p {
      color: var(--text-muted);
      font-size: 0.95rem;
      max-width: 540px;
      margin: 0 auto;
    }

    /* Stepper Navigation */
    .stepper {
      display: flex;
      justify-content: space-between;
      margin-bottom: 2rem;
      position: relative;
    }

    .stepper::before {
      content: '';
      position: absolute;
      top: 19px;
      left: 30px;
      right: 30px;
      height: 2px;
      background: var(--border-color);
      z-index: 1;
    }

    .step-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      position: relative;
      z-index: 2;
      cursor: pointer;
      user-select: none;
    }

    .step-circle {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: #131b2e;
      border: 2px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-heading);
      font-weight: 700;
      font-size: 0.95rem;
      color: var(--text-muted);
      transition: all 0.25s ease;
    }

    .step-item:hover .step-circle {
      border-color: #38bdf8;
      color: #fff;
    }

    .step-item.active .step-circle {
      border-color: #38bdf8;
      background: #0284c7;
      color: #fff;
      box-shadow: 0 0 15px rgba(56, 189, 248, 0.5);
    }

    .step-item.completed .step-circle {
      border-color: #10b981;
      background: #059669;
      color: #fff;
    }

    .step-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
    }

    .step-item.active .step-label {
      color: var(--text-main);
    }

    /* Card */
    .glass-card {
      background: var(--bg-card);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border-color);
      border-radius: 20px;
      padding: 2.2rem;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
      margin-bottom: 1.5rem;
    }

    .step-section {
      display: none;
      animation: fadeIn 0.3s ease forwards;
    }

    .step-section.active {
      display: block;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .section-title {
      font-family: var(--font-heading);
      font-size: 1.4rem;
      font-weight: 700;
      margin-bottom: 0.4rem;
      color: #fff;
    }

    .section-desc {
      color: var(--text-muted);
      font-size: 0.9rem;
      margin-bottom: 1.5rem;
    }

    /* Form Fields */
    .form-group {
      margin-bottom: 1.2rem;
    }

    .form-group label {
      display: block;
      font-size: 0.82rem;
      font-weight: 600;
      color: #cbd5e1;
      margin-bottom: 0.4rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .form-input {
      width: 100%;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      padding: 0.85rem 1.1rem;
      color: #fff;
      font-size: 0.95rem;
      font-family: inherit;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .form-input:focus {
      border-color: #38bdf8;
      box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2);
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-family: var(--font-heading);
      font-weight: 600;
      font-size: 0.95rem;
      padding: 0.85rem 1.5rem;
      border-radius: 12px;
      border: none;
      cursor: pointer;
      transition: all 0.2s ease;
      text-decoration: none;
      width: 100%;
    }

    .btn-primary {
      background: linear-gradient(135deg, #0284c7 0%, #4f46e5 100%);
      color: #fff;
      box-shadow: 0 4px 15px rgba(2, 132, 199, 0.35);
    }

    .btn-primary:hover {
      box-shadow: 0 6px 20px rgba(2, 132, 199, 0.5);
      transform: translateY(-1px);
    }

    .btn-success {
      background: linear-gradient(135deg, #059669 0%, #10b981 100%);
      color: #fff;
      box-shadow: 0 4px 15px rgba(16, 185, 129, 0.35);
    }

    .btn-google {
      background: #ffffff;
      color: #1e293b;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      font-weight: 600;
    }

    .btn-google:hover {
      background: #f8fafc;
      transform: translateY(-1px);
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.08);
      color: #e2e8f0;
      border: 1px solid rgba(255, 255, 255, 0.12);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.14);
    }

    .btn-row {
      display: flex;
      gap: 1rem;
      margin-top: 1.5rem;
    }

    /* Tabs */
    .tab-nav {
      display: flex;
      background: rgba(15, 23, 42, 0.7);
      border-radius: 12px;
      padding: 4px;
      margin-bottom: 1.5rem;
      border: 1px solid var(--border-color);
    }

    .tab-btn {
      flex: 1;
      padding: 0.6rem 1rem;
      border: none;
      background: transparent;
      color: var(--text-muted);
      font-family: inherit;
      font-weight: 600;
      font-size: 0.88rem;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .tab-btn.active {
      background: #1e293b;
      color: #38bdf8;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    }

    /* QR Code Display */
    .qr-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1rem 0;
    }

    .qr-box {
      background: #fff;
      padding: 16px;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      display: inline-block;
      margin-bottom: 1rem;
      min-width: 232px;
      min-height: 232px;
    }

    /* Pairing Code Display */
    .pairing-box {
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid rgba(56, 189, 248, 0.3);
      border-radius: 16px;
      padding: 1.8rem 1rem;
      text-align: center;
      margin-bottom: 1.2rem;
    }

    .pairing-code-digits {
      font-family: monospace;
      font-size: 2.4rem;
      font-weight: 800;
      letter-spacing: 0.15em;
      color: #38bdf8;
      text-shadow: 0 0 15px rgba(56, 189, 248, 0.5);
      margin-bottom: 0.8rem;
    }

    .copy-btn {
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.3);
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .copy-btn:hover {
      background: rgba(56, 189, 248, 0.25);
    }

    /* Guide Box */
    .guide-box {
      background: rgba(15, 23, 42, 0.6);
      border-radius: 12px;
      padding: 1rem 1.2rem;
      font-size: 0.85rem;
      color: #94a3b8;
      line-height: 1.6;
      border: 1px solid rgba(255, 255, 255, 0.05);
      margin-top: 1rem;
    }

    .guide-box ol {
      padding-left: 1.2rem;
      margin-top: 0.4rem;
    }

    .guide-box li {
      margin-bottom: 0.2rem;
    }

    /* Status Badges */
    .status-card {
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid var(--border-color);
      border-radius: 14px;
      padding: 1.2rem;
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 1.2rem;
    }

    .status-icon {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.3rem;
    }

    .status-icon.active { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .status-icon.pending { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }

    .status-info h4 { font-size: 0.95rem; font-weight: 700; color: #fff; }
    .status-info p { font-size: 0.82rem; color: var(--text-muted); }

    .status-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    /* Success Screen */
    .success-hero {
      text-align: center;
      padding: 1rem 0;
    }

    .success-icon-large {
      width: 72px;
      height: 72px;
      background: rgba(16, 185, 129, 0.2);
      border: 2px solid #10b981;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      margin-bottom: 1rem;
      box-shadow: 0 0 25px rgba(16, 185, 129, 0.4);
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="badge-live"><span class="pulse-dot"></span> SS40 AI Assistant Live</div>
      <h1>AI Email ➔ WhatsApp Portal</h1>
      <p>Connect your mailbox and WhatsApp in under 60 seconds to draft professional replies effortlessly.</p>
    </div>

    <!-- Stepper Navigation (Click any step to switch) -->
    <div class="stepper">
      <div class="step-item active" id="stepIndicator1" onclick="setStep(1)">
        <div class="step-circle">1</div>
        <div class="step-label">Identity</div>
      </div>
      <div class="step-item" id="stepIndicator2" onclick="setStep(2)">
        <div class="step-circle">2</div>
        <div class="step-label">Gmail</div>
      </div>
      <div class="step-item" id="stepIndicator3" onclick="setStep(3)">
        <div class="step-circle">3</div>
        <div class="step-label">WhatsApp</div>
      </div>
      <div class="step-item" id="stepIndicator4" onclick="setStep(4)">
        <div class="step-circle">4</div>
        <div class="step-label">Ready</div>
      </div>
    </div>

    <!-- Main Card -->
    <div class="glass-card">
      <!-- STEP 1: IDENTITY -->
      <div class="step-section active" id="stepSection1">
        <h2 class="section-title">Step 1: Your Profile Details</h2>
        <p class="section-desc">Enter your name to personalize your executive assistant.</p>

        <div class="form-group">
          <label>Full Name</label>
          <input type="text" id="inputName" class="form-input" placeholder="e.g. Abraham Samuel" value="Abraham Samuel">
        </div>

        <button class="btn btn-primary" onclick="proceedToStep2()">
          Continue to Step 2: Connect Gmail ➔
        </button>
      </div>

      <!-- STEP 2: EMAIL CONNECT (GMAIL & UNIVERSAL IMAP/SMTP) -->
      <div class="step-section" id="stepSection2">
        <h2 class="section-title">Step 2: Connect Your Business Mailbox</h2>
        <p class="section-desc">Authorize your business mailbox using 1-Click Google Sign-In or your Custom Domain (Zoho Mail, Microsoft 365, etc.).</p>

        <!-- Status Card for Email -->
        <div id="gmailStatusCard" class="status-card" style="margin-bottom: 1.2rem;">
          <div class="status-icon pending" id="gmailIcon">📧</div>
          <div class="status-info">
            <h4 id="gmailStatusTitle">Mailbox Not Linked</h4>
            <p id="gmailStatusSub">Choose your email provider below to connect.</p>
          </div>
        </div>

        <!-- Provider Tab Controls -->
        <div class="tab-nav" style="margin-bottom: 1.2rem;">
          <button class="tab-btn active" id="tabBtnGoogle" onclick="switchEmailTab('google')">🌐 Google Workspace / Gmail</button>
          <button class="tab-btn" id="tabBtnSmtp" onclick="switchEmailTab('smtp')">⚡ Zoho / Outlook / Custom Domain</button>
        </div>

        <!-- TAB 1: GOOGLE OAUTH -->
        <div id="tabContentGoogle" style="margin-bottom: 1.5rem;">
          <div style="display: flex; flex-direction: column; gap: 0.8rem;">
            <a id="btnConnectGoogle" href="/auth/google" class="btn btn-google">
              <svg width="20" height="20" viewBox="0 0 48 48" style="vertical-align: middle;">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                <path fill="#FF3D00" d="m6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"/>
                <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
              </svg>
              Sign In with Google (1-Click)
            </a>
          </div>
        </div>

        <!-- TAB 2: UNIVERSAL IMAP & SMTP (ZOHO / MICROSOFT / ANY DOMAIN) -->
        <div id="tabContentSmtp" style="display: none; margin-bottom: 1.5rem;">
          <div class="form-group" style="margin-bottom: 1rem;">
            <label>Business Email Address</label>
            <input type="email" id="smtpEmailInput" class="form-input" placeholder="e.g. name@company.com" onchange="autoDetectPreset()">
          </div>

          <div class="form-group" style="margin-bottom: 1rem;">
            <label>App-Specific Password</label>
            <input type="password" id="smtpPasswordInput" class="form-input" placeholder="Enter your 16-character app password">
            <span style="font-size: 0.75rem; color: #94a3b8; display: block; margin-top: 4px;">🔒 Encrypted with AES-256-GCM before storage.</span>
          </div>

          <!-- Collapsible Advanced Settings -->
          <details style="background: rgba(15, 23, 42, 0.6); border: 1px solid #334155; border-radius: 8px; padding: 0.8rem; margin-bottom: 1rem;">
            <summary style="cursor: pointer; color: #38bdf8; font-size: 0.85rem; font-weight: 600;">
              ⚙️ Advanced Server Settings (Auto-Configured)
            </summary>
            <div style="margin-top: 0.8rem;">
              <div class="form-group" style="margin-bottom: 0.6rem;">
                <label style="font-size: 0.75rem;">Provider Preset</label>
                <select id="smtpPresetSelect" class="form-input" style="font-size: 0.85rem;" onchange="applySelectedPreset()">
                  <option value="auto">✨ Auto-Detect from Domain</option>
                  <option value="zoho_in">Zoho Mail (India - imap.zoho.in)</option>
                  <option value="zoho_com">Zoho Mail (Global - imap.zoho.com)</option>
                  <option value="outlook">Microsoft Outlook / Office 365</option>
                  <option value="custom">Custom Server</option>
                </select>
              </div>

              <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 0.6rem; margin-bottom: 0.6rem;">
                <div class="form-group">
                  <label style="font-size: 0.75rem;">IMAP Host</label>
                  <input type="text" id="smtpImapHost" class="form-input" style="font-size: 0.85rem;" placeholder="imap.zoho.in" value="imap.zoho.in">
                </div>
                <div class="form-group">
                  <label style="font-size: 0.75rem;">IMAP Port</label>
                  <input type="number" id="smtpImapPort" class="form-input" style="font-size: 0.85rem;" placeholder="993" value="993">
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 0.6rem;">
                <div class="form-group">
                  <label style="font-size: 0.75rem;">SMTP Host</label>
                  <input type="text" id="smtpSmtpHost" class="form-input" style="font-size: 0.85rem;" placeholder="smtp.zoho.in" value="smtp.zoho.in">
                </div>
                <div class="form-group">
                  <label style="font-size: 0.75rem;">SMTP Port</label>
                  <input type="number" id="smtpSmtpPort" class="form-input" style="font-size: 0.85rem;" placeholder="465" value="465">
                </div>
              </div>
            </div>
          </details>
        </div>

        <!-- Inline Notification Message -->
        <div id="step2Alert" style="font-size: 0.85rem; padding: 0.6rem 0.8rem; border-radius: 8px; margin-bottom: 1rem; display: none;"></div>

        <!-- Add Another Mailbox Button -->
        <button id="btnAddAnotherMailbox" class="btn btn-secondary" onclick="resetEmailFormForAnother()" style="display: none; width: 100%; margin-bottom: 0.8rem; border-color: #38bdf8; color: #38bdf8;">
          ➕ Connect Another Mailbox
        </button>

        <!-- Primary Action Navigation -->
        <div class="btn-row">
          <button class="btn btn-secondary" onclick="setStep(1)" style="flex:1;">
            ⬅ Back
          </button>
          <button id="btnStep2Continue" class="btn btn-primary" onclick="proceedToStep3()" style="flex:2;">
            Authorize & Continue to Step 3 ➔
          </button>
        </div>
      </div>

      <!-- STEP 3: WHATSAPP LINKING -->
      <div class="step-section" id="stepSection3">
        <h2 class="section-title">Step 3: Link Your WhatsApp</h2>
        <p class="section-desc">Scan the live QR code with your phone camera or request an 8-digit Pairing Code.</p>

        <!-- Status Card for WhatsApp -->
        <div id="waStatusCard" class="status-card">
          <div class="status-icon pending" id="waIcon">📱</div>
          <div class="status-info">
            <h4 id="waStatusTitle">WhatsApp Pairing Pending</h4>
            <p id="waStatusSub">Scan the QR code below using WhatsApp ➔ Linked Devices.</p>
          </div>
        </div>

        <!-- Tab Controls -->
        <div class="tab-nav">
          <button class="tab-btn active" id="tabBtnQr" onclick="switchTab('qr')">📲 Scan QR Code (Fastest)</button>
          <button class="tab-btn" id="tabBtnPairing" onclick="switchTab('pairing')">🔑 8-Digit Pairing Code</button>
        </div>

        <!-- TAB 1: QR CODE (DEFAULT) -->
        <div id="tabContentQr">
          <div class="qr-container">
            <div class="qr-box" id="qrcodeBox">
              <p style="color:#64748b;padding:2rem;text-align:center;">Loading QR Code...</p>
            </div>
            <p style="font-size:0.85rem;color:#94a3b8;margin-bottom:1rem;">Open WhatsApp ➔ Settings ➔ Linked Devices ➔ Scan this QR Code</p>
            <button class="btn btn-secondary" onclick="refreshQr()" style="max-width:280px;">🔄 Refresh QR Code</button>
          </div>
        </div>

        <!-- TAB 2: 8-DIGIT PAIRING CODE -->
        <div id="tabContentPairing" style="display:none;">
          <div class="form-group" style="margin-bottom:1rem;">
            <label>Enter WhatsApp Phone Number</label>
            <input type="text" id="pairingPhoneInput" class="form-input" placeholder="+916383813648" value="+916383813648">
          </div>

          <div class="pairing-box">
            <p style="font-size:0.85rem;color:#94a3b8;margin-bottom:0.6rem;">Your WhatsApp Pairing Code:</p>
            <div class="pairing-code-digits" id="pairingCodeDisplay">---- - ----</div>
            <button class="copy-btn" onclick="copyPairingCode()">📋 Copy Code</button>
          </div>

          <button class="btn btn-secondary" onclick="generatePairingCode()" style="margin-bottom:1rem;">
            ⚡ Generate 8-Digit Pairing Code
          </button>

          <div class="guide-box">
            <strong>How to enter code on WhatsApp:</strong>
            <ol>
              <li>Open <strong>WhatsApp</strong> on your phone.</li>
              <li>Go to <strong>Settings / Menu ➔ Linked Devices</strong>.</li>
              <li>Tap <strong>Link a Device</strong>.</li>
              <li>Tap <strong>"Link with phone number instead"</strong> at the bottom.</li>
              <li>Enter the 8-digit code shown above!</li>
            </ol>
          </div>
        </div>

        <div class="btn-row">
          <button class="btn btn-secondary" onclick="setStep(2)" style="flex:1;">
            ⬅ Back to Gmail
          </button>
          <button class="btn btn-primary" onclick="setStep(4)" style="flex:2;">
            Go to Ready Dashboard ➔
          </button>
        </div>
      </div>

      <!-- STEP 4: SUCCESS DASHBOARD -->
      <div class="step-section" id="stepSection4">
        <div class="success-hero">
          <div class="success-icon-large">🎉</div>
          <h2 class="section-title">All Systems Connected & Active!</h2>
          <p class="section-desc">Your AI Executive Email Assistant is live and monitoring your mailbox.</p>
        </div>

        <div class="status-grid">
          <div class="status-card">
            <div class="status-icon active" id="dashGmailIcon">📧</div>
            <div class="status-info">
              <h4 id="dashEmail">Connected Gmail</h4>
              <p>Sync: Real-time (10s)</p>
            </div>
          </div>
          <div class="status-card">
            <div class="status-icon active" id="dashWaIcon">📱</div>
            <div class="status-info">
              <h4 id="dashPhone">Connected WhatsApp</h4>
              <p>Socket: Active</p>
            </div>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:0.8rem;">
          <button class="btn btn-success" onclick="sendTestWelcome()">
            💬 Send Test Welcome Message to WhatsApp
          </button>
          <a href="/api/diagnostics" target="_blank" class="btn btn-secondary">
            🩺 Open Deep System Diagnostics
          </a>
          <button class="btn btn-secondary" onclick="setStep(1)">
            ⚙️ Configuration
          </button>
        </div>
      </div>
    </div>
  </div>

  <script>
    let currentStep = 1;
    let userName = "Abraham Samuel";
    let pollTimer = null;
    let qrObj = null;

    function setStep(step) {
      currentStep = step;
      for (let i = 1; i <= 4; i++) {
        const item = document.getElementById('stepIndicator' + i);
        const section = document.getElementById('stepSection' + i);
        if (i < step) {
          item.className = 'step-item completed';
          section.className = 'step-section';
        } else if (i === step) {
          item.className = 'step-item active';
          section.className = 'step-section active';
        } else {
          item.className = 'step-item';
          section.className = 'step-section';
        }
      }
      if (step === 3) {
        refreshQr();
      }
    }

    async function proceedToStep2() {
      userName = document.getElementById('inputName').value.trim() || 'Client';
      document.getElementById('btnConnectGoogle').href = '/auth/google?name=' + encodeURIComponent(userName);
      fetch('/api/user/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: userName })
      }).catch(() => {});
      setStep(2);
      checkStatus();
    }

    let activeEmailTab = 'google';

    function switchEmailTab(tab) {
      activeEmailTab = tab;
      const alertBox = document.getElementById('step2Alert');
      if (alertBox) alertBox.style.display = 'none';

      if (tab === 'smtp') {
        document.getElementById('tabBtnSmtp').className = 'tab-btn active';
        document.getElementById('tabBtnGoogle').className = 'tab-btn';
        document.getElementById('tabContentSmtp').style.display = 'block';
        document.getElementById('tabContentGoogle').style.display = 'none';
      } else {
        document.getElementById('tabBtnGoogle').className = 'tab-btn active';
        document.getElementById('tabBtnSmtp').className = 'tab-btn';
        document.getElementById('tabContentGoogle').style.display = 'block';
        document.getElementById('tabContentSmtp').style.display = 'none';
      }
    }

    async function autoDetectPreset() {
      const email = document.getElementById('smtpEmailInput').value.trim();
      if (!email.includes('@')) return;
      try {
        const res = await fetch('/api/email/detect-preset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emailAddress: email })
        });
        if (res.ok) {
          const preset = await res.json();
          if (preset.imapHost) document.getElementById('smtpImapHost').value = preset.imapHost;
          if (preset.imapPort) document.getElementById('smtpImapPort').value = preset.imapPort;
          if (preset.smtpHost) document.getElementById('smtpSmtpHost').value = preset.smtpHost;
          if (preset.smtpPort) document.getElementById('smtpSmtpPort').value = preset.smtpPort;
        }
      } catch (e) {}
    }

    function applySelectedPreset() {
      const preset = document.getElementById('smtpPresetSelect').value;
      if (preset === 'zoho_in') {
        document.getElementById('smtpImapHost').value = 'imap.zoho.in';
        document.getElementById('smtpImapPort').value = '993';
        document.getElementById('smtpSmtpHost').value = 'smtp.zoho.in';
        document.getElementById('smtpSmtpPort').value = '465';
      } else if (preset === 'zoho_com') {
        document.getElementById('smtpImapHost').value = 'imap.zoho.com';
        document.getElementById('smtpImapPort').value = '993';
        document.getElementById('smtpSmtpHost').value = 'smtp.zoho.com';
        document.getElementById('smtpSmtpPort').value = '465';
      } else if (preset === 'outlook') {
        document.getElementById('smtpImapHost').value = 'outlook.office365.com';
        document.getElementById('smtpImapPort').value = '993';
        document.getElementById('smtpSmtpHost').value = 'smtp.office365.com';
        document.getElementById('smtpSmtpPort').value = '587';
      } else if (preset === 'auto') {
        autoDetectPreset();
      }
    }

    let isEmailAuthorized = false;

    function resetEmailFormForAnother() {
      document.getElementById('smtpEmailInput').value = '';
      document.getElementById('smtpPasswordInput').value = '';
      const alertBox = document.getElementById('step2Alert');
      alertBox.style.display = 'block';
      alertBox.style.background = 'rgba(56, 189, 248, 0.15)';
      alertBox.style.color = '#38bdf8';
      alertBox.style.border = '1px solid rgba(56, 189, 248, 0.3)';
      alertBox.innerHTML = '👉 Enter your next mailbox credentials below and click <b>Authorize & Continue to Step 3 ➔</b>';
      switchEmailTab('smtp');
    }

    async function proceedToStep3() {
      const alertBox = document.getElementById('step2Alert');
      const btn = document.getElementById('btnStep2Continue');

      if (activeEmailTab === 'google') {
        if (!isEmailAuthorized) {
          alertBox.style.display = 'block';
          alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
          alertBox.style.color = '#f87171';
          alertBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
          alertBox.innerText = '⚠️ Please click "Sign In with Google" above to authorize your Google mailbox first.';
          return;
        }
        setStep(3);
        return;
      }

      // Handle Custom Business Email / Zoho / Outlook authorization
      const email = document.getElementById('smtpEmailInput').value.trim();
      const password = document.getElementById('smtpPasswordInput').value;

      if (!email || !password) {
        alertBox.style.display = 'block';
        alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
        alertBox.style.color = '#f87171';
        alertBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        alertBox.innerText = '❌ Please enter both your Business Email and App Password.';
        return;
      }

      // Trigger automatic verification and authorization
      btn.disabled = true;
      btn.innerText = '⏳ Authorizing & Connecting Mailbox...';
      alertBox.style.display = 'block';
      alertBox.style.background = 'rgba(56, 189, 248, 0.15)';
      alertBox.style.color = '#38bdf8';
      alertBox.style.border = '1px solid rgba(56, 189, 248, 0.3)';
      alertBox.innerText = 'Testing TLS handshake with mail server...';

      const payload = {
        userName: userName,
        whatsappNumber: liveConnectedPhone || '+916383813648',
        emailAddress: email,
        password: password,
        imapHost: document.getElementById('smtpImapHost').value.trim(),
        imapPort: Number(document.getElementById('smtpImapPort').value) || 993,
        smtpHost: document.getElementById('smtpSmtpHost').value.trim(),
        smtpPort: Number(document.getElementById('smtpSmtpPort').value) || 465,
      };

      try {
        const res = await fetch('/api/email/connect-smtp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok && data.success) {
          alertBox.style.background = 'rgba(34, 197, 94, 0.15)';
          alertBox.style.color = '#4ade80';
          alertBox.style.border = '1px solid rgba(34, 197, 94, 0.3)';
          alertBox.innerText = '✅ Mailbox Authorized Successfully! Advancing to WhatsApp linking...';
          isEmailAuthorized = true;
          await checkStatus();
          setTimeout(() => {
            btn.disabled = false;
            btn.innerText = 'Authorize & Continue to Step 3 ➔';
            setStep(3);
          }, 800);
        } else {
          btn.disabled = false;
          btn.innerText = 'Authorize & Continue to Step 3 ➔';
          alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
          alertBox.style.color = '#f87171';
          alertBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
          alertBox.innerText = '❌ ' + (data.error || 'Server Authentication Failed. Check App Password or IMAP settings.');
        }
      } catch (e) {
        btn.disabled = false;
        btn.innerText = 'Authorize & Continue to Step 3 ➔';
        alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
        alertBox.style.color = '#f87171';
        alertBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        alertBox.innerText = '❌ Network Error: ' + e.message;
      }
    }

    function switchTab(tab) {
      if (tab === 'pairing') {
        document.getElementById('tabBtnPairing').className = 'tab-btn active';
        document.getElementById('tabBtnQr').className = 'tab-btn';
        document.getElementById('tabContentPairing').style.display = 'block';
        document.getElementById('tabContentQr').style.display = 'none';
      } else {
        document.getElementById('tabBtnPairing').className = 'tab-btn';
        document.getElementById('tabBtnQr').className = 'tab-btn active';
        document.getElementById('tabContentPairing').style.display = 'none';
        document.getElementById('tabContentQr').style.display = 'block';
        refreshQr();
      }
    }

    let liveConnectedPhone = null;

    async function checkStatus() {
      try {
        const res = await fetch('/api/user/status');
        if (!res.ok) return;
        const data = await res.json();
        liveConnectedPhone = data.whatsappNumber || null;

        // Update Step 2: Email visual card
        const accountsList = data.emailAccounts || [];
        if (data.emailConnected && (accountsList.length > 0 || data.emailAddress)) {
          isEmailAuthorized = true;
          const countStr = accountsList.length > 1 ? ' (' + accountsList.length + ' Connected)' : '';
          const accountsDisplay = accountsList.length > 0
            ? accountsList.map(function(a, i) { return (i + 1) + '. ' + a.email + ' [' + (a.provider === 'IMAP_SMTP' ? 'Custom' : 'Google') + ']'; }).join(' • ')
            : data.emailAddress;
          document.getElementById('gmailStatusCard').className = 'status-card';
          document.getElementById('gmailIcon').className = 'status-icon active';
          document.getElementById('gmailStatusTitle').innerText = '✅ Mailbox Linked' + countStr;
          document.getElementById('gmailStatusSub').innerText = accountsDisplay;
          document.getElementById('dashEmail').innerText = accountsList.map((a) => a.email).join(', ') || data.emailAddress;
          document.getElementById('dashGmailIcon').className = 'status-icon active';
          document.getElementById('btnAddAnotherMailbox').style.display = 'block';
          document.getElementById('btnStep2Continue').innerText = 'Continue to Step 3 ➔';
        } else {
          isEmailAuthorized = false;
          document.getElementById('gmailIcon').className = 'status-icon pending';
          document.getElementById('gmailStatusTitle').innerText = 'Mailbox Not Linked';
          document.getElementById('gmailStatusSub').innerText = 'Choose your email provider above to authorize.';
          document.getElementById('dashEmail').innerText = 'Mailbox Not Linked';
          document.getElementById('dashGmailIcon').className = 'status-icon pending';
          document.getElementById('btnAddAnotherMailbox').style.display = 'none';
          document.getElementById('btnStep2Continue').innerText = 'Authorize & Continue to Step 3 ➔';
        }

        // Update Step 3: WhatsApp visual card
        if (data.whatsappConnected) {
          const displayPhone = data.whatsappNumber || 'Connected Device';
          document.getElementById('waStatusCard').className = 'status-card';
          document.getElementById('waIcon').className = 'status-icon active';
          document.getElementById('waStatusTitle').innerText = '✅ WhatsApp: ' + displayPhone;
          document.getElementById('waStatusSub').innerText = 'Device socket is online and active.';
          document.getElementById('dashPhone').innerText = displayPhone;
          document.getElementById('dashWaIcon').className = 'status-icon active';
        } else {
          document.getElementById('waIcon').className = 'status-icon pending';
          document.getElementById('waStatusTitle').innerText = 'WhatsApp Pairing Pending';
          document.getElementById('waStatusSub').innerText = 'Scan the QR code with WhatsApp on your phone.';
          document.getElementById('dashPhone').innerText = 'WhatsApp Offline';
          document.getElementById('dashWaIcon').className = 'status-icon pending';
        }
      } catch (e) {
        console.error('Status poll error:', e);
      }
    }

    async function checkStatusManual() {
      await checkStatus();
      alert('Checked status. Current connection state refreshed!');
    }

    async function generatePairingCode() {
      const phoneInput = document.getElementById('pairingPhoneInput').value.trim();
      document.getElementById('pairingCodeDisplay').innerText = 'GENERATING...';
      try {
        const res = await fetch('/api/whatsapp/pairing-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: phoneInput })
        });
        const data = await res.json();
        if (data.code) {
          document.getElementById('pairingCodeDisplay').innerText = data.code;
        } else if (data.status === 'error' && data.message && data.message.includes('already connected')) {
          document.getElementById('pairingCodeDisplay').innerText = 'CONNECTED ✅';
          checkStatus();
        } else {
          document.getElementById('pairingCodeDisplay').innerText = data.message || 'READY OR ACTIVE';
        }
      } catch (e) {
        document.getElementById('pairingCodeDisplay').innerText = 'RETRY AGAIN';
      }
    }

    function copyPairingCode() {
      const code = document.getElementById('pairingCodeDisplay').innerText.replace(/[\\s-]/g, '');
      navigator.clipboard.writeText(code).then(() => {
        alert('Pairing Code copied to clipboard: ' + code);
      });
    }

    async function refreshQr() {
      const box = document.getElementById('qrcodeBox');
      try {
        const res = await fetch('/api/whatsapp/qr-data');
        const data = await res.json();
        if (data.qr) {
          box.innerHTML = '';
          qrObj = new QRCode(box, {
            text: data.qr,
            width: 200,
            height: 200
          });
        } else if (data.connected) {
          box.innerHTML = '<p style="color:#10b981;font-weight:bold;padding:2rem;">✅ WhatsApp Connected!</p>';
        } else {
          box.innerHTML = '<p style="color:#64748b;padding:2rem;">Generating fresh QR code...</p>';
        }
      } catch (e) {
        box.innerHTML = '<p style="color:#ef4444;padding:2rem;">Failed to fetch QR</p>';
      }
    }

    async function sendTestWelcome() {
      try {
        const payload = liveConnectedPhone ? { whatsapp: liveConnectedPhone } : {};
        const res = await fetch('/api/user/welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        const display = data.whatsapp || liveConnectedPhone || 'your connected WhatsApp';
        alert('Welcome notification dispatched to ' + display + '!');
      } catch (e) {
        alert('Dispatched test message.');
      }
    }

    // Read URL params
    const urlParams = new URLSearchParams(window.location.search);
    const stepParam = parseInt(urlParams.get('step')) || 1;
    setStep(stepParam);

    pollTimer = setInterval(checkStatus, 3000);
    checkStatus();
  </script>
</body>
</html>`;
}
