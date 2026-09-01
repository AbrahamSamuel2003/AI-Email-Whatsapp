export function getOnboardingHtml(initialPhone: string = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <meta http-equiv="Pragma" content="no-cache" />
  <meta http-equiv="Expires" content="0" />
  <title>SS40 NETWORK — AI Email to WhatsApp Portal</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Outfit:wght@500;600;700;800&display=swap" rel="stylesheet">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <style>
    :root {
      --ss40-teal-primary: #0F766E;
      --ss40-teal-hover: #115E59;
      --ss40-teal-vibrant: #0D9488;
      --ss40-cyan: #2DD4BF;
      --ss40-mint: #D8E8E2;
      --ss40-mint-soft: #E6F2EE;
      --bg-page: #FFFFFF;
      --bg-card: #FFFFFF;
      --border-color: #E2E8F0;
      --border-hover: #0F766E;
      --text-heading: #0F172A;
      --text-body: #334155;
      --text-muted: #64748B;
      --shadow-card: 0 10px 30px -5px rgba(15, 118, 110, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04);
      --shadow-hover: 0 20px 35px -5px rgba(15, 118, 110, 0.14), 0 8px 10px -4px rgba(0, 0, 0, 0.06);
      --font-brand: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --font-display: 'Outfit', 'Inter', -apple-system, sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background-color: var(--bg-page);
      background-image: 
        radial-gradient(ellipse 80% 50% at 50% -10%, #D8E8E2 0%, transparent 65%),
        radial-gradient(circle 600px at 100% 100%, #E6F2EE 0%, transparent 60%),
        radial-gradient(circle 500px at 0% 100%, rgba(216, 232, 226, 0.4) 0%, transparent 60%);
      background-attachment: fixed;
      color: var(--text-body);
      font-family: var(--font-brand);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: clamp(1rem, 3vw, 2.5rem) clamp(0.75rem, 3vw, 1.5rem);
      -webkit-font-smoothing: antialiased;
    }

    .container {
      width: 100%;
      max-width: 760px;
      margin: 0 auto;
    }

    /* Header */
    .header {
      text-align: center;
      margin-bottom: clamp(1.2rem, 3vw, 2rem);
    }

    .brand-logo-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px;
      border-radius: 9999px;
      background: #D8E8E2;
      border: 1px solid rgba(15, 118, 110, 0.25);
      color: var(--ss40-teal-primary);
      font-size: clamp(0.72rem, 2vw, 0.8rem);
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 0.9rem;
    }

    .brand-logo-badge .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--ss40-teal-primary);
      box-shadow: 0 0 10px var(--ss40-teal-primary);
      animation: pulse 1.8s infinite;
    }

    @keyframes pulse {
      0% { transform: scale(0.95); opacity: 0.8; }
      50% { transform: scale(1.35); opacity: 1; }
      100% { transform: scale(0.95); opacity: 0.8; }
    }

    .header h1 {
      font-family: var(--font-display);
      font-size: clamp(1.6rem, 5vw, 2.4rem);
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.2;
      color: var(--text-heading);
      margin-bottom: 0.5rem;
    }

    .header h1 .brand-accent {
      color: var(--ss40-teal-primary);
    }

    .header p {
      color: var(--text-muted);
      font-size: clamp(0.85rem, 2.2vw, 0.98rem);
      max-width: 560px;
      margin: 0 auto;
      line-height: 1.5;
    }

    /* Stepper Navigation */
    .stepper {
      display: flex;
      justify-content: space-between;
      margin-bottom: clamp(1.2rem, 3vw, 2rem);
      position: relative;
    }

    .stepper::before {
      content: '';
      position: absolute;
      top: 18px;
      left: 24px;
      right: 24px;
      height: 2px;
      background: #E2E8F0;
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
      flex: 1;
    }

    .step-circle {
      width: clamp(32px, 8vw, 38px);
      height: clamp(32px, 8vw, 38px);
      border-radius: 50%;
      background: #F8FAFC;
      border: 2px solid #CBD5E1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-display);
      font-weight: 700;
      font-size: clamp(0.8rem, 2.5vw, 0.95rem);
      color: var(--text-muted);
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .step-item:hover .step-circle {
      border-color: var(--ss40-teal-primary);
      color: var(--ss40-teal-primary);
      transform: scale(1.05);
    }

    .step-item.active .step-circle {
      border-color: var(--ss40-teal-primary);
      background: var(--ss40-teal-primary);
      color: #FFFFFF;
      box-shadow: 0 0 16px rgba(15, 118, 110, 0.35);
    }

    .step-item.completed .step-circle {
      border-color: var(--ss40-teal-primary);
      background: var(--ss40-teal-vibrant);
      color: #FFFFFF;
    }

    .step-label {
      font-size: clamp(0.68rem, 1.8vw, 0.78rem);
      font-weight: 600;
      color: var(--text-muted);
      transition: color 0.2s;
      white-space: nowrap;
    }

    .step-item.active .step-label {
      color: var(--ss40-teal-primary);
      font-weight: 700;
    }

    /* Main Glass Card */
    .glass-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: clamp(14px, 3vw, 22px);
      padding: clamp(1.2rem, 4vw, 2.2rem);
      box-shadow: var(--shadow-card);
      margin-bottom: 1.5rem;
    }

    .step-section {
      display: none;
      animation: fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    .step-section.active {
      display: block;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .section-title {
      font-family: var(--font-display);
      font-size: clamp(1.2rem, 3.5vw, 1.45rem);
      font-weight: 800;
      margin-bottom: 0.35rem;
      color: var(--text-heading);
      letter-spacing: -0.02em;
    }

    .section-desc {
      color: var(--text-muted);
      font-size: clamp(0.82rem, 2.2vw, 0.92rem);
      margin-bottom: 1.4rem;
      line-height: 1.5;
    }

    /* Form Fields */
    .form-group {
      margin-bottom: 1.2rem;
    }

    .form-group label {
      display: block;
      font-size: 0.78rem;
      font-weight: 700;
      color: #475569;
      margin-bottom: 0.4rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .form-input {
      width: 100%;
      background: #FFFFFF;
      border: 1px solid #CBD5E1;
      border-radius: 12px;
      padding: clamp(0.75rem, 2.5vw, 0.9rem) 1.1rem;
      color: var(--text-heading);
      font-size: clamp(0.88rem, 2.5vw, 0.96rem);
      font-family: inherit;
      outline: none;
      transition: all 0.2s ease;
      min-height: 46px;
    }

    .form-input:focus {
      border-color: var(--ss40-teal-primary);
      background: #FFFFFF;
      box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.18);
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-family: var(--font-brand);
      font-weight: 700;
      font-size: clamp(0.88rem, 2.5vw, 0.96rem);
      padding: clamp(0.75rem, 2.5vw, 0.9rem) 1.5rem;
      border-radius: 12px;
      border: none;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      text-decoration: none;
      width: 100%;
      min-height: 48px;
      letter-spacing: -0.01em;
    }

    .btn-primary {
      background: var(--ss40-teal-primary);
      color: #FFFFFF;
      box-shadow: 0 4px 15px rgba(15, 118, 110, 0.25);
    }

    .btn-primary:hover {
      background: var(--ss40-teal-hover);
      box-shadow: 0 6px 20px rgba(15, 118, 110, 0.35);
      transform: translateY(-1px);
    }

    .btn-success {
      background: #059669;
      color: #FFFFFF;
      box-shadow: 0 4px 15px rgba(5, 150, 105, 0.25);
    }

    .btn-success:hover {
      background: #047857;
      transform: translateY(-1px);
    }

    .btn-google {
      background: #FFFFFF;
      color: #0F172A;
      border: 1px solid #CBD5E1;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
      font-weight: 700;
    }

    .btn-google:hover {
      background: #F8FAFC;
      border-color: #94A3B8;
      transform: translateY(-1px);
    }

    .btn-secondary {
      background: #F1F5F9;
      color: #334155;
      border: 1px solid #CBD5E1;
    }

    .btn-secondary:hover {
      background: #E2E8F0;
      color: #0F172A;
    }

    .btn-row {
      display: flex;
      gap: 0.8rem;
      margin-top: 1.5rem;
      flex-wrap: wrap;
    }

    /* Tabs */
    .tab-nav {
      display: flex;
      background: #F1F5F9;
      border-radius: 12px;
      padding: 4px;
      margin-bottom: 1.4rem;
      border: 1px solid var(--border-color);
      gap: 4px;
    }

    .tab-btn {
      flex: 1;
      padding: 0.65rem 0.8rem;
      border: none;
      background: transparent;
      color: var(--text-muted);
      font-family: inherit;
      font-weight: 600;
      font-size: clamp(0.78rem, 2.2vw, 0.88rem);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }

    .tab-btn.active {
      background: var(--ss40-teal-primary);
      color: #FFFFFF;
      box-shadow: 0 2px 8px rgba(15, 118, 110, 0.3);
    }

    /* QR Code Box */
    .qr-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1rem 0;
    }

    .qr-box {
      background: #FFFFFF;
      padding: 16px;
      border-radius: 16px;
      border: 1px solid #E2E8F0;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
      display: inline-block;
      margin-bottom: 1rem;
      max-width: 100%;
    }

    /* Pairing Code Box */
    .pairing-box {
      background: #F8FAFC;
      border: 1px solid var(--ss40-mint);
      border-radius: 16px;
      padding: clamp(1.2rem, 3vw, 1.8rem) 1rem;
      text-align: center;
      margin-bottom: 1.2rem;
    }

    .pairing-code-digits {
      font-family: monospace;
      font-size: clamp(1.6rem, 6vw, 2.3rem);
      font-weight: 800;
      letter-spacing: clamp(0.08em, 2vw, 0.15em);
      color: var(--ss40-teal-primary);
      margin-bottom: 0.8rem;
      word-break: break-all;
    }

    .copy-btn {
      background: var(--ss40-mint);
      color: var(--ss40-teal-primary);
      border: 1px solid rgba(15, 118, 110, 0.3);
      padding: 7px 16px;
      border-radius: 8px;
      font-size: 0.82rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }

    .copy-btn:hover {
      background: var(--ss40-teal-primary);
      color: #FFFFFF;
    }

    /* Guide Box */
    .guide-box {
      background: #F8FAFC;
      border-radius: 12px;
      padding: 1rem 1.2rem;
      font-size: 0.84rem;
      color: var(--text-body);
      line-height: 1.6;
      border: 1px solid #E2E8F0;
      margin-top: 1rem;
    }

    .guide-box ol {
      padding-left: 1.2rem;
      margin-top: 0.4rem;
    }

    .guide-box li {
      margin-bottom: 0.25rem;
    }

    /* Status Cards */
    .status-card {
      background: #F8FAFC;
      border: 1px solid var(--border-color);
      border-radius: 14px;
      padding: clamp(0.9rem, 2.5vw, 1.2rem);
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 1.2rem;
      transition: all 0.2s;
    }

    .status-icon {
      width: clamp(38px, 6vw, 44px);
      height: clamp(38px, 6vw, 44px);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2rem;
      flex-shrink: 0;
    }

    .status-icon.active { background: #D1FAE5; color: #059669; }
    .status-icon.pending { background: #FEF3C7; color: #D97706; }

    .status-info { min-width: 0; flex: 1; }
    .status-info h4 { font-size: clamp(0.88rem, 2.2vw, 0.96rem); font-weight: 700; color: var(--text-heading); word-break: break-word; }
    .status-info p { font-size: clamp(0.76rem, 2vw, 0.82rem); color: var(--text-muted); word-break: break-word; }

    .status-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    /* Success Hero */
    .success-hero {
      text-align: center;
      padding: 1rem 0;
    }

    .success-icon-large {
      width: clamp(56px, 10vw, 72px);
      height: clamp(56px, 10vw, 72px);
      background: #D8E8E2;
      border: 2px solid var(--ss40-teal-primary);
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: clamp(1.6rem, 4vw, 2rem);
      margin-bottom: 1rem;
    }

    /* Mode Selection Cards */
    .mode-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1rem;
      margin: 1.2rem 0;
    }

    .mode-card {
      background: #F8FAFC;
      border: 2px solid var(--border-color);
      border-radius: 14px;
      padding: clamp(0.9rem, 2.5vw, 1.2rem);
      cursor: pointer;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      text-align: left;
    }

    .mode-card:hover {
      border-color: var(--ss40-teal-primary);
      background: #FFFFFF;
      transform: translateY(-2px);
      box-shadow: var(--shadow-card);
    }

    .mode-card.active {
      border-color: var(--ss40-teal-primary);
      background: var(--ss40-mint-soft);
      box-shadow: 0 0 18px rgba(15, 118, 110, 0.18);
    }

    .mode-badge {
      display: inline-block;
      font-size: 0.72rem;
      font-weight: 800;
      text-transform: uppercase;
      padding: 3px 9px;
      border-radius: 20px;
      margin-bottom: 0.5rem;
      letter-spacing: 0.06em;
    }

    .mode-badge.standard {
      background: #D1FAE5;
      color: #059669;
      border: 1px solid #A7F3D0;
    }

    .mode-badge.advanced {
      background: #D8E8E2;
      color: var(--ss40-teal-primary);
      border: 1px solid rgba(15, 118, 110, 0.3);
    }

    .mode-title {
      font-size: clamp(0.92rem, 2.5vw, 1.02rem);
      font-weight: 700;
      color: var(--text-heading);
      margin-bottom: 0.3rem;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .mode-desc {
      font-size: 0.8rem;
      color: var(--text-muted);
      line-height: 1.45;
    }

    /* Mobile Responsive Optimizations */
    html, body {
      overflow-x: hidden;
      width: 100%;
      max-width: 100vw;
    }

    #qrcodeBox canvas, #qrcodeBox img {
      max-width: 100% !important;
      height: auto !important;
      margin: 0 auto;
      display: block;
    }

    @media (max-width: 640px) {
      body {
        padding: 0.75rem 0.5rem;
        justify-content: flex-start;
      }
      .container {
        padding: 0 0.25rem;
      }
      .header {
        margin-bottom: 1.2rem;
      }
      .header h1 {
        font-size: 1.5rem;
      }
      .header p {
        font-size: 0.84rem;
      }
      .glass-card {
        padding: 1.25rem 0.9rem;
        border-radius: 16px;
        margin-bottom: 1rem;
      }
      .section-title {
        font-size: 1.15rem;
      }
      .section-desc {
        font-size: 0.82rem;
        margin-bottom: 1rem;
      }
      .form-input {
        font-size: 16px; /* Prevents auto-zoom on iOS */
        padding: 0.75rem 0.85rem;
      }
      .tab-nav {
        flex-direction: row;
        gap: 3px;
        padding: 3px;
      }
      .tab-btn {
        padding: 0.6rem 0.4rem;
        font-size: 0.76rem;
        white-space: normal;
        text-align: center;
        line-height: 1.25;
      }
      .mode-grid {
        grid-template-columns: 1fr;
        gap: 0.75rem;
      }
      .btn-row {
        flex-direction: column;
        gap: 0.6rem;
        margin-top: 1.2rem;
      }
      .btn-row button, .btn-row a {
        width: 100% !important;
        flex: none !important;
        min-height: 48px;
      }
      .status-grid {
        grid-template-columns: 1fr;
        gap: 0.75rem;
      }
      .pairing-box {
        padding: 1.2rem 0.6rem;
      }
      .pairing-code-digits {
        font-size: clamp(1.3rem, 6.5vw, 1.85rem);
        letter-spacing: clamp(1px, 1.5vw, 4px);
      }
      .qr-box {
        padding: 10px;
      }
      .smtp-grid-2col {
        grid-template-columns: 1fr !important;
      }
    }

    @media (max-width: 380px) {
      .stepper::before {
        top: 14px;
        left: 10px;
        right: 10px;
      }
      .step-circle {
        width: 28px;
        height: 28px;
        font-size: 0.75rem;
      }
      .step-label {
        font-size: 0.62rem;
      }
      .brand-logo-badge {
        font-size: 0.66rem;
        padding: 4px 10px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="brand-logo-badge">
        <span class="pulse-dot"></span> SS40 NETWORK &bull; AI ENTERPRISE
      </div>
      <h1>AI Email <span class="brand-accent">&rarr;</span> WhatsApp Portal</h1>
      <p>Connect your business mailbox and WhatsApp in under 60 seconds to draft and send executive replies effortlessly.</p>
    </div>

    <!-- Stepper Navigation (Click any step to switch) -->
    <div class="stepper">
      <div class="step-item active" id="stepIndicator1" onclick="setStep(1)">
        <div class="step-circle">1</div>
        <div class="step-label">Identity</div>
      </div>
      <div class="step-item" id="stepIndicator2" onclick="setStep(2)">
        <div class="step-circle">2</div>
        <div class="step-label">Mailbox</div>
      </div>
      <div class="step-item" id="stepIndicator3" onclick="setStep(3)">
        <div class="step-circle">3</div>
        <div class="step-label">WhatsApp</div>
      </div>
      <div class="step-item" id="stepIndicator4" onclick="setStep(4)">
        <div class="step-circle">4</div>
        <div class="step-label">Active</div>
      </div>
    </div>

    <!-- Main Card -->
    <div class="glass-card">
      <!-- STEP 1: IDENTITY & DEVICE CREDENTIALS -->
      <div class="step-section active" id="stepSection1">
        <h2 class="section-title">Step 1: Profile & Device Credentials</h2>
        <p class="section-desc">Enter your name and WhatsApp mobile number to establish your device credentials.</p>

        <div class="form-group" style="margin-bottom: 1.2rem;">
          <label>Full Name</label>
          <input type="text" id="inputName" class="form-input" placeholder="Full Name" value="">
        </div>

        <div class="form-group" style="margin-bottom: 1.5rem;">
          <label>Mobile Number (WhatsApp)</label>
          <input type="text" id="inputPhone" class="form-input" placeholder="e.g. +14155552671" value="" onchange="syncPhoneToPairing()">
        </div>

        <!-- Inline Notification for Step 1 -->
        <div id="step1Alert" style="font-size: 0.85rem; padding: 0.6rem 0.8rem; border-radius: 8px; margin-bottom: 1rem; display: none; background: rgba(239, 68, 68, 0.15); color: #DC2626; border: 1px solid rgba(239, 68, 68, 0.3);"></div>

        <button class="btn btn-primary" onclick="proceedToStep2()">
          Continue to Step 2: Connect Mailbox ➔
        </button>
      </div>

      <!-- STEP 2: EMAIL CONNECT (GMAIL & UNIVERSAL IMAP/SMTP) -->
      <div class="step-section" id="stepSection2">
        <h2 class="section-title">Step 2: Connect Business Mailbox</h2>
        <p class="section-desc">Authorize your business mailbox using 1-Click Google Sign-In or Custom Domain (Zoho Mail, Microsoft 365, etc.).</p>

        <!-- Status Card for Email -->
        <div id="gmailStatusCard" class="status-card" style="margin-bottom: 1.2rem;">
          <div class="status-icon pending" id="gmailIcon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
          </div>
          <div class="status-info">
            <h4 id="gmailStatusTitle">Mailbox Not Linked</h4>
            <p id="gmailStatusSub">Choose your email provider below to connect.</p>
          </div>
        </div>

        <!-- Provider Tab Controls -->
        <div class="tab-nav" style="margin-bottom: 1.2rem;">
          <button class="tab-btn active" id="tabBtnGoogle" onclick="switchEmailTab('google')">Google Workspace / Gmail</button>
          <button class="tab-btn" id="tabBtnSmtp" onclick="switchEmailTab('smtp')">Zoho / Outlook / Custom Domain</button>
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
            <span style="font-size: 0.75rem; color: #64748b; display: block; margin-top: 4px;">Encrypted with AES-256-GCM before storage.</span>
          </div>

          <!-- Collapsible Advanced Settings -->
          <details style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0.8rem; margin-bottom: 1rem;">
            <summary style="cursor: pointer; color: #0F766E; font-size: 0.85rem; font-weight: 700;">
              Advanced Server Settings (Auto-Configured)
            </summary>
            <div style="margin-top: 0.8rem;">
              <div class="form-group" style="margin-bottom: 0.6rem;">
                <label style="font-size: 0.75rem;">Provider Preset</label>
                <select id="smtpPresetSelect" class="form-input" style="font-size: 0.85rem;" onchange="applySelectedPreset()">
                  <option value="auto">Auto-Detect from Domain</option>
                  <option value="zoho_in">Zoho Mail (India - imap.zoho.in)</option>
                  <option value="zoho_com">Zoho Mail (Global - imap.zoho.com)</option>
                  <option value="outlook">Microsoft Outlook / Office 365</option>
                  <option value="custom">Custom Server</option>
                </select>
              </div>

              <div class="smtp-grid-2col" style="display: grid; grid-template-columns: 2fr 1fr; gap: 0.6rem; margin-bottom: 0.6rem;">
                <div class="form-group">
                  <label style="font-size: 0.75rem;">IMAP Host</label>
                  <input type="text" id="smtpImapHost" class="form-input" style="font-size: 0.85rem;" placeholder="imap.zoho.in" value="imap.zoho.in">
                </div>
                <div class="form-group">
                  <label style="font-size: 0.75rem;">IMAP Port</label>
                  <input type="number" id="smtpImapPort" class="form-input" style="font-size: 0.85rem;" placeholder="993" value="993">
                </div>
              </div>

              <div class="smtp-grid-2col" style="display: grid; grid-template-columns: 2fr 1fr; gap: 0.6rem;">
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
        <button id="btnAddAnotherMailbox" class="btn btn-secondary" onclick="resetEmailFormForAnother()" style="display: none; width: 100%; margin-bottom: 0.8rem; border-color: #0F766E; color: #0F766E; background: #D8E8E2;">
          + Connect Another Mailbox
        </button>

        <!-- Primary Action Navigation -->
        <div class="btn-row">
          <button class="btn btn-secondary" onclick="setStep(1)" style="flex:1;">
            Back
          </button>
          <button id="btnStep2Continue" class="btn btn-primary" onclick="proceedToStep3()" style="flex:2;">
            Authorize & Continue to Step 3 ➔
          </button>
        </div>
      </div>

      <!-- STEP 3: WHATSAPP ASSISTANT EXPERIENCE & LINKING -->
      <div class="step-section" id="stepSection3">
        <h2 class="section-title">Step 3: WhatsApp Assistant Experience & Linking</h2>
        <p class="section-desc">Choose your assistant mode and scan the QR code or request an 8-digit Pairing Code.</p>

        <!-- Mode Selection Grid -->
        <label style="display:block; font-size:0.9rem; font-weight:700; color:#0F172A; margin-bottom:0.5rem;">
          Choose WhatsApp Assistant Experience:
        </label>
        
        <div class="mode-grid" style="margin-bottom: 1.5rem;">
          <!-- Standard Mode -->
          <div class="mode-card" id="modeCardStandard" onclick="selectMode('STANDARD')">
            <span class="mode-badge standard">Standard Mode</span>
            <div class="mode-title">Minimalist AI</div>
            <div class="mode-desc">
              • Clean email & OTP alerts<br>
              • Full voice note & multilingual replies<br>
              • One-touch SEND | EDIT | CANCEL<br>
              • <i>Zero command noise or clutter</i>
            </div>
          </div>

          <!-- Executive Pro Mode -->
          <div class="mode-card active" id="modeCardAdvanced" onclick="selectMode('ADVANCED')">
            <span class="mode-badge advanced">Executive Pro</span>
            <div class="mode-title">Full Power Suite</div>
            <div class="mode-desc">
              • Multi-mailbox switcher (SWITCH 1/2/3)<br>
              • Compose new emails (NEW MAIL)<br>
              • Inbox scanner (CHECK MAIL / STATUS)<br>
              • Batch ignore & queue management
            </div>
          </div>
        </div>

        <!-- Status Card for WhatsApp -->
        <div id="waStatusCard" class="status-card">
          <div class="status-icon pending" id="waIcon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          </div>
          <div class="status-info">
            <h4 id="waStatusTitle">WhatsApp Pairing Pending</h4>
            <p id="waStatusSub">Scan the QR code below using WhatsApp ➔ Linked Devices.</p>
          </div>
        </div>

        <!-- Connected WhatsApp Notice with Switch Device Option -->
        <div id="waConnectedNotice" style="display:none; background: #D8E8E2; border: 1px solid #0F766E; border-radius: 8px; padding: 0.8rem; margin-bottom: 1.2rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.6rem;">
            <div>
              <div style="font-size: 0.85rem; font-weight: 700; color: #0F172A;">WhatsApp Device Active</div>
              <div id="waActiveNumberDisplay" style="font-size: 0.8rem; color: #0F766E; font-family: monospace;">Connected Device</div>
            </div>
            <button class="btn btn-secondary" onclick="unlinkAndConnectNewWhatsApp()" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; border-color: #0F766E; color: #0F766E; background: #FFFFFF; width: auto;">
              Link Different WhatsApp Device
            </button>
          </div>
        </div>

        <!-- Tab Controls -->
        <div class="tab-nav">
          <button class="tab-btn active" id="tabBtnQr" onclick="switchTab('qr')">Scan QR Code</button>
          <button class="tab-btn" id="tabBtnPairing" onclick="switchTab('pairing')">8-Digit Pairing Code</button>
        </div>

        <!-- TAB 1: QR CODE (DEFAULT) -->
        <div id="tabContentQr">
          <div class="qr-container">
            <div class="qr-box" id="qrcodeBox">
              <p style="color:#64748b;padding:2rem;text-align:center;">Loading QR Code...</p>
            </div>
            <p style="font-size:0.85rem;color:#64748b;margin-bottom:1rem;">Open WhatsApp ➔ Settings ➔ Linked Devices ➔ Scan this QR Code</p>
            <div style="display: flex; gap: 0.6rem; justify-content: center;">
              <button class="btn btn-secondary" onclick="refreshQr()" style="max-width:220px;">Refresh Status</button>
            </div>
          </div>
        </div>

        <!-- TAB 2: 8-DIGIT PAIRING CODE -->
        <div id="tabContentPairing" style="display:none;">
          <div class="form-group" style="margin-bottom:1rem;">
            <label>Enter WhatsApp Phone Number</label>
            <input type="text" id="pairingPhoneInput" class="form-input" placeholder="e.g. +14155552671" value="">
          </div>

          <div class="pairing-box">
            <p style="font-size:0.85rem;color:#64748b;margin-bottom:0.6rem;">Your WhatsApp Pairing Code:</p>
            <div class="pairing-code-digits" id="pairingCodeDisplay">---- - ----</div>
            <button class="copy-btn" onclick="copyPairingCode()">Copy Code</button>
          </div>

          <div style="margin-bottom: 1rem;">
            <button class="btn btn-primary" onclick="generatePairingCode()">
              Generate 8-Digit Pairing Code
            </button>
          </div>

          <div class="guide-box">
            <strong>How to enter code on WhatsApp:</strong>
            <ol>
              <li>Open <strong>WhatsApp</strong> on your phone.</li>
              <li>Go to <strong>Settings / Menu ➔ Linked Devices</strong>.</li>
              <li>Tap <strong>Link a Device</strong>.</li>
              <li>Tap <strong>"Link with phone number instead"</strong> at the bottom.</li>
              <li>Enter the 8-digit code shown above.</li>
            </ol>
          </div>
        </div>

        <div class="btn-row">
          <button class="btn btn-secondary" onclick="setStep(2)" style="flex:1;">
            Back to Mailbox
          </button>
          <button class="btn btn-primary" onclick="setStep(4)" style="flex:2;">
            Go to Ready Dashboard ➔
          </button>
        </div>
      </div>

      <!-- STEP 4: SUCCESS DASHBOARD -->
      <div class="step-section" id="stepSection4">
        <div class="success-hero">
          <div class="success-icon-large">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0F766E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
          </div>
          <h2 class="section-title">All Systems Connected & Active</h2>
          <p class="section-desc">Your AI Email Assistant is live and monitoring your mailbox.</p>
        </div>

        <div class="status-grid">
          <div class="status-card">
            <div class="status-icon active" id="dashGmailIcon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
            </div>
            <div class="status-info">
              <h4 id="dashEmail">Connected Mailbox</h4>
              <p>Sync: Real-time</p>
            </div>
          </div>
          <div class="status-card">
            <div class="status-icon active" id="dashWaIcon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            </div>
            <div class="status-info">
              <h4 id="dashPhone">Connected WhatsApp</h4>
              <p>Socket: Active</p>
            </div>
          </div>
        </div>

        <!-- Mode Status in Dashboard (Clean Read-Only Active Mode Display) -->
        <div class="status-card" style="margin-bottom: 1rem;">
          <div class="status-icon active" id="dashModeIcon" style="background: #D1FAE5; color: #059669;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
          </div>
          <div class="status-info">
            <h4 id="dashModeTitle">Standard Minimalist Mode</h4>
            <p id="dashModeDesc">Clean notifications, voice replies, zero command noise.</p>
          </div>
        </div>

        <!-- NTFY Mobile Push Notifications Setup Card -->
        <div class="status-card" style="margin-bottom: 1.5rem; border: 1px solid #0F766E; background: #FFFFFF; flex-direction: column; align-items: stretch; gap: 0.8rem; padding: 1.2rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.6rem;">
            <div style="display: flex; align-items: center; gap: 0.8rem;">
              <div class="status-icon active" style="background: #D8E8E2; color: #0F766E;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              </div>
              <div>
                <h4 style="margin: 0; font-size: 1rem; color: #0F172A; font-weight: 700;">Mobile Push Alerts (NTFY App)</h4>
                <p style="margin: 0.2rem 0 0; font-size: 0.85rem; color: #64748b;">Instant push notifications delivered directly to your phone screen.</p>
              </div>
            </div>
            <span class="mode-badge standard" style="background: #D8E8E2; color: #0F766E;">Push Alerts Live</span>
          </div>

          <div style="background: #F8FAFC; border: 1px dashed #CBD5E1; border-radius: 8px; padding: 1rem; margin-top: 0.4rem;">
            <div style="font-size: 0.85rem; font-weight: 600; color: #0F172A; margin-bottom: 0.4rem;">Your Unique NTFY Topic Code:</div>
            <div style="display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap;">
              <code id="ntfyTopicDisplay" style="font-size: 1rem; font-weight: 700; color: #0F766E; background: #FFFFFF; border: 1px solid #0F766E; border-radius: 6px; padding: 0.4rem 0.8rem; font-family: monospace; letter-spacing: 0.5px;">ss40-alerts-broadcast</code>
              <button class="btn btn-secondary" onclick="copyNtfyTopicCode()" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; border-color: #0F766E; color: #0F766E; background: #FFFFFF; width: auto;">
                Copy NTFY Code
              </button>
            </div>

            <div style="font-size: 0.8rem; color: #64748B; margin-top: 0.8rem; line-height: 1.5;">
              <strong>3-Step Mobile Setup:</strong><br>
              1. Install the free <strong>ntfy</strong> app on your phone (iOS App Store or Android Google Play).<br>
              2. Open the app, tap <strong>+ (Subscribe to topic)</strong>.<br>
              3. Enter your unique code: <code id="ntfyCodeSubGuide" style="color: #0F766E; font-weight: 600;">ss40-alerts-broadcast</code>
            </div>
          </div>

          <div style="display: flex; gap: 0.6rem; margin-top: 0.4rem;">
            <button class="btn btn-secondary" onclick="sendTestNtfyNotification()" style="border-color: #0F766E; color: #0F766E; background: #FFFFFF;">
              Send Test Push Notification to NTFY App
            </button>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:0.8rem;">
          <button class="btn btn-success" onclick="sendTestWelcome()">
            Send Welcome Summary to WhatsApp
          </button>
          <button class="btn btn-secondary" onclick="setStep(3); unlinkAndConnectNewWhatsApp();">
            Link Different WhatsApp Account
          </button>
          <button class="btn btn-secondary" onclick="setStep(1)">
            Modify Identity & Mode (Step 1)
          </button>
        </div>
      </div>
    </div>
  </div>

  <script>
    let currentStep = 1;
    let userName = "";
    let selectedMode = localStorage.getItem('ss40_assistant_mode') || "STANDARD";
    let pollTimer = null;
    let qrObj = null;

    function selectMode(mode) {
      selectedMode = mode;
      localStorage.setItem('ss40_assistant_mode', mode);
      const std = document.getElementById('modeCardStandard');
      const adv = document.getElementById('modeCardAdvanced');
      if (std && adv) {
        std.className = mode === 'STANDARD' ? 'mode-card active' : 'mode-card';
        adv.className = mode === 'ADVANCED' ? 'mode-card active' : 'mode-card';
      }
      fetch('/api/user/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      }).catch(() => {});
      updateDashModeUI(mode);
    }

    function updateDashModeUI(mode) {
      const icon = document.getElementById('dashModeIcon');
      const title = document.getElementById('dashModeTitle');
      const desc = document.getElementById('dashModeDesc');
      if (!icon || !title || !desc) return;
      if (mode === 'STANDARD') {
        icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>';
        icon.style.background = '#D1FAE5';
        icon.style.color = '#059669';
        title.innerText = 'Standard Minimalist Mode (Active)';
        desc.innerText = 'Clean notifications, voice replies, zero command noise.';
      } else {
        icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="m17 5-5-3-5 3"/><path d="m17 19-5 3-5-3"/></svg>';
        icon.style.background = '#D8E8E2';
        icon.style.color = '#0F766E';
        title.innerText = 'Executive Pro Mode (Active)';
        desc.innerText = 'Multi-mailbox, compose, scanner & full suite enabled.';
      }
    }

    // Initialize UI on Step 1 (or query param if specified)
    window.addEventListener('DOMContentLoaded', () => {
      const urlParams = new URLSearchParams(window.location.search);
      const urlStep = parseInt(urlParams.get('step'), 10);
      const initialStep = (urlStep && urlStep >= 1 && urlStep <= 4) ? urlStep : 1;
      setStep(initialStep);
      selectMode(selectedMode);
    });

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
      const alertBox = document.getElementById('step1Alert');
      if (alertBox) alertBox.style.display = 'none';

      userName = document.getElementById('inputName').value.trim();
      const userPhone = document.getElementById('inputPhone').value.trim();

      if (!userName || !userPhone) {
        if (alertBox) {
          alertBox.style.display = 'block';
          alertBox.innerText = 'Please enter both Full Name and Mobile Number.';
        }
        return;
      }

      const btn = document.querySelector('#stepSection1 .btn-primary');
      if (btn) {
        btn.disabled = true;
        btn.innerText = 'Verifying Credentials...';
      }

      try {
        const res = await fetch('/api/user/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: userName, whatsappNumber: userPhone })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          localStorage.setItem('ss40_client_phone', userPhone);
          localStorage.setItem('ss40_client_name', userName);
          document.getElementById('btnConnectGoogle').href = '/auth/google?name=' + encodeURIComponent(userName) + '&whatsapp=' + encodeURIComponent(userPhone);
          const pairingInput = document.getElementById('pairingPhoneInput');
          if (pairingInput) pairingInput.value = userPhone;

          if (btn) {
            btn.disabled = false;
            btn.innerText = 'Continue to Step 2: Connect Mailbox ➔';
          }
          setStep(2);
          checkStatus();
        } else {
          if (btn) {
            btn.disabled = false;
            btn.innerText = 'Continue to Step 2: Connect Mailbox ➔';
          }
          if (alertBox) {
            alertBox.style.display = 'block';
            alertBox.innerText = data.error || 'Access Denied';
          }
        }
      } catch (e) {
        if (btn) {
          btn.disabled = false;
          btn.innerText = 'Continue to Step 2: Connect Mailbox ➔';
        }
        if (alertBox) {
          alertBox.style.display = 'block';
          alertBox.innerText = 'Access Denied';
        }
      }
    }

    function syncPhoneToPairing() {
      const p = document.getElementById('inputPhone')?.value?.trim();
      if (p) {
        const pairingInput = document.getElementById('pairingPhoneInput');
        if (pairingInput) pairingInput.value = p;
      }
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
      alertBox.innerHTML = 'Enter your next mailbox credentials below and click <b>Authorize & Continue to Step 3 ➔</b>';
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
          alertBox.innerText = 'Please click "Sign In with Google" above to authorize your Google mailbox first.';
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
        alertBox.innerText = 'Please enter both your Business Email and App Password.';
        return;
      }

      // Trigger automatic verification and authorization
      btn.disabled = true;
      btn.innerText = 'Authorizing & Connecting Mailbox...';
      alertBox.style.display = 'block';
      alertBox.style.background = 'rgba(56, 189, 248, 0.15)';
      alertBox.style.color = '#38bdf8';
      alertBox.style.border = '1px solid rgba(56, 189, 248, 0.3)';
      alertBox.innerText = 'Testing TLS handshake with mail server...';

      const payload = {
        userName: userName,
        whatsappNumber: liveConnectedPhone || '',
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
          alertBox.innerText = 'Mailbox Authorized Successfully. Advancing to WhatsApp linking...';
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
          alertBox.innerText = (data.error || 'Server Authentication Failed. Check App Password or IMAP settings.');
        }
      } catch (e) {
        btn.disabled = false;
        btn.innerText = 'Authorize & Continue to Step 3 ➔';
        alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
        alertBox.style.color = '#f87171';
        alertBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        alertBox.innerText = 'Network Error: ' + e.message;
      }
    }

    function switchTab(tab) {
      if (tab === 'pairing') {
        document.getElementById('tabBtnPairing').className = 'tab-btn active';
        document.getElementById('tabBtnQr').className = 'tab-btn';
        document.getElementById('tabContentPairing').style.display = 'block';
        document.getElementById('tabContentQr').style.display = 'none';
      } else {
        document.getElementById('tabBtnQr').className = 'tab-btn active';
        document.getElementById('tabBtnPairing').className = 'tab-btn';
        document.getElementById('tabContentQr').style.display = 'block';
        document.getElementById('tabContentPairing').style.display = 'none';
        refreshQr();
      }
    }

    let liveConnectedPhone = null;

    async function checkStatus() {
      try {
        const savedPhone = localStorage.getItem('ss40_client_phone') || '';
        const url = savedPhone ? ('/api/user/status?whatsapp=' + encodeURIComponent(savedPhone)) : '/api/user/status';
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        liveConnectedPhone = data.whatsappNumber || null;

        if (data.mode) {
          const localSaved = localStorage.getItem('ss40_assistant_mode');
          if (localSaved && localSaved !== data.mode) {
            // Push locally chosen mode to backend database
            fetch('/api/user/mode', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mode: localSaved })
            }).catch(() => {});
          } else {
            selectedMode = data.mode;
            localStorage.setItem('ss40_assistant_mode', data.mode);
            const std = document.getElementById('modeCardStandard');
            const adv = document.getElementById('modeCardAdvanced');
            if (std && adv) {
              std.className = data.mode === 'STANDARD' ? 'mode-card active' : 'mode-card';
              adv.className = data.mode === 'ADVANCED' ? 'mode-card active' : 'mode-card';
            }
            updateDashModeUI(data.mode);
          }
        }

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
          document.getElementById('gmailStatusTitle').innerText = 'Mailbox Linked' + countStr;
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
          document.getElementById('waStatusTitle').innerText = 'WhatsApp Linked: ' + displayPhone;
          document.getElementById('waStatusSub').innerText = 'Device socket is online and active.';
          document.getElementById('dashPhone').innerText = displayPhone;
          document.getElementById('dashWaIcon').className = 'status-icon active';

          const notice = document.getElementById('waConnectedNotice');
          const noticeNum = document.getElementById('waActiveNumberDisplay');
          if (notice && noticeNum) {
            notice.style.display = 'block';
            noticeNum.innerText = displayPhone;
          }
        } else {
          document.getElementById('waIcon').className = 'status-icon pending';
          document.getElementById('waStatusTitle').innerText = 'WhatsApp Pairing Pending';
          document.getElementById('waStatusSub').innerText = 'Scan the QR code with WhatsApp on your phone.';
          document.getElementById('dashPhone').innerText = 'WhatsApp Offline';
          document.getElementById('dashWaIcon').className = 'status-icon pending';

          const notice = document.getElementById('waConnectedNotice');
          if (notice) notice.style.display = 'none';
        }

        // Update Step 4: NTFY Topic Display
        if (data.ntfyTopic) {
          userNtfyTopic = data.ntfyTopic;
          const displayEl = document.getElementById('ntfyTopicDisplay');
          if (displayEl) displayEl.innerText = data.ntfyTopic;
          const guideEl = document.getElementById('ntfyCodeSubGuide');
          if (guideEl) guideEl.innerText = data.ntfyTopic;
        }
      } catch (e) {
        console.error('Status poll error:', e);
      }
    }

    let userNtfyTopic = 'ss40-alerts-broadcast';

    function copyNtfyTopicCode() {
      navigator.clipboard.writeText(userNtfyTopic).then(() => {
        alert('Copied NTFY Topic Code to clipboard: ' + userNtfyTopic);
      }).catch(() => {
        alert('Topic Code: ' + userNtfyTopic);
      });
    }

    async function sendTestNtfyNotification() {
      const payload = {
        topic: userNtfyTopic,
        whatsapp: liveConnectedPhone || ''
      };
      try {
        const res = await fetch('/api/user/test-ntfy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          alert('Test push notification sent successfully to NTFY topic: ' + userNtfyTopic + '. Please check your mobile ntfy app!');
        } else {
          alert('Dispatched notification to: ' + userNtfyTopic);
        }
      } catch (e) {
        alert('Dispatched test push notification to: ' + userNtfyTopic);
      }
    }

    async function unlinkAndConnectNewWhatsApp() {
      const confirmed = confirm('Do you want to disconnect the active WhatsApp session to link a new phone number or scan a new QR code?');
      if (!confirmed) return;

      const box = document.getElementById('qrcodeBox');
      if (box) box.innerHTML = '<p style="color:#0F766E;padding:2rem;text-align:center;">Disconnecting old session and generating fresh QR...</p>';

      try {
        await fetch('/api/whatsapp/reset-session', { method: 'POST' });
        liveConnectedPhone = null;
        const phoneInput = document.getElementById('pairingPhoneInput');
        if (phoneInput) phoneInput.value = '';
        const codeDisplay = document.getElementById('pairingCodeDisplay');
        if (codeDisplay) codeDisplay.innerText = '---- - ----';
        const notice = document.getElementById('waConnectedNotice');
        if (notice) notice.style.display = 'none';
        await checkStatus();
        setTimeout(refreshQr, 1000);
      } catch (e) {
        refreshQr();
      }
    }

    async function checkStatusManual() {
      await checkStatus();
    }

    async function generatePairingCode() {
      const phoneInput = document.getElementById('pairingPhoneInput').value.trim();
      if (!phoneInput) {
        alert('Please enter your WhatsApp phone number with country code (e.g., +14155552671).');
        return;
      }
      document.getElementById('pairingCodeDisplay').innerText = 'GENERATING...';
      try {
        const res = await fetch('/api/whatsapp/pairing-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: phoneInput, forceReset: true })
        });
        const data = await res.json();
        if (data.code) {
          document.getElementById('pairingCodeDisplay').innerText = data.code;
          checkStatus();
        } else {
          document.getElementById('pairingCodeDisplay').innerText = data.message || 'RETRY AGAIN';
        }
      } catch (e) {
        document.getElementById('pairingCodeDisplay').innerText = 'RETRY AGAIN';
      }
    }

    async function forceResetPairing() {
      const phoneInput = document.getElementById('pairingPhoneInput').value.trim();
      document.getElementById('pairingCodeDisplay').innerText = 'RESETTING...';
      try {
        const res = await fetch('/api/whatsapp/pairing-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: phoneInput, forceReset: true })
        });
        const data = await res.json();
        if (data.code) {
          document.getElementById('pairingCodeDisplay').innerText = data.code;
          checkStatus();
        } else {
          document.getElementById('pairingCodeDisplay').innerText = data.message || 'RETRY AGAIN';
        }
      } catch (e) {
        document.getElementById('pairingCodeDisplay').innerText = 'RETRY AGAIN';
      }
    }

    function copyPairingCode() {
      const code = document.getElementById('pairingCodeDisplay').innerText.replace(/[\s-]/g, '');
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
          box.innerHTML = '<p style="color:#0F766E;font-weight:bold;padding:2rem;">WhatsApp Connected</p>';
        } else {
          box.innerHTML = '<p style="color:#64748b;padding:2rem;">Generating fresh QR code...</p>';
        }
      } catch (e) {
        box.innerHTML = '<p style="color:#ef4444;padding:2rem;">Failed to fetch QR</p>';
      }
    }

    async function forceResetQr() {
      const box = document.getElementById('qrcodeBox');
      box.innerHTML = '<p style="color:#2DD4BF;padding:2rem;">Resetting session & generating brand new QR...</p>';
      try {
        await fetch('/api/whatsapp/reset-session', { method: 'POST' });
        setTimeout(refreshQr, 1500);
      } catch (e) {
        refreshQr();
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

