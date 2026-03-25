import { Hono } from "hono";
import { Env } from "./env";
import { apiRoutes } from "./api/index";
import { handleScheduled } from "./cron/handler";

const app = new Hono<{ Bindings: Env }>();

// API routes
app.route("/api", apiRoutes);

// Health check
app.get("/health", (c) => c.json({ ok: true }));

// Public setup page (bypasses Cloudflare Access)
app.get("/setup/:token", (c) => c.html(setupPageHtml(c.env.WORKER_URL)));

// All other routes → serve static assets (React SPA)
app.all("*", async (c) => {
  // Try to serve the exact path from assets
  let resp = await c.env.ASSETS.fetch(c.req.raw);

  // If not found or if it's an SPA route, serve index.html
  if (resp.status === 404) {
    const url = new URL(c.req.url);
    url.pathname = "/";
    resp = await c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw));
  }

  return resp;
});

function setupPageHtml(workerUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Connect Your Etsy Shop</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.6; }
  .container { max-width: 600px; margin: 40px auto; padding: 0 20px; }
  .card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px; margin-bottom: 24px; }
  h1 { font-size: 24px; margin-bottom: 8px; }
  h2 { font-size: 18px; margin-bottom: 16px; color: #334155; }
  .subtitle { color: #64748b; margin-bottom: 24px; }
  .step { margin-bottom: 20px; padding: 16px; background: #f8fafc; border-radius: 8px; border-left: 3px solid #3b82f6; }
  .step-num { font-weight: 700; color: #3b82f6; }
  .copy-box { background: #f1f5f9; padding: 10px 14px; border-radius: 6px; font-family: monospace; font-size: 13px; margin: 8px 0; word-break: break-all; cursor: pointer; position: relative; }
  .copy-box:hover { background: #e2e8f0; }
  .copy-box::after { content: 'Click to copy'; position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 11px; color: #94a3b8; font-family: sans-serif; }
  input { width: 100%; padding: 10px 14px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 15px; margin: 8px 0; }
  input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
  button { width: 100%; padding: 12px; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; }
  .btn-primary { background: #f97316; color: white; }
  .btn-primary:hover { background: #ea580c; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .success { background: #f0fdf4; border-color: #86efac; text-align: center; }
  .success h2 { color: #16a34a; }
  .error { color: #dc2626; font-size: 14px; margin: 8px 0; }
  .loading { display: none; }
  .info { font-size: 13px; color: #64748b; margin-top: 8px; }
  a { color: #3b82f6; }
  .hidden { display: none; }
</style>
</head>
<body>
<div class="container">
  <div id="loading-card" class="card">
    <p>Loading...</p>
  </div>

  <div id="setup-card" class="card hidden">
    <h1>Connect Your Etsy Shop</h1>
    <p class="subtitle" id="shop-info"></p>

    <h2>Step 1: Create an Etsy App</h2>
    <div class="step">
      <p><span class="step-num">1.</span> Go to <a href="https://www.etsy.com/developers/your-apps" target="_blank">etsy.com/developers/your-apps</a></p>
      <p><span class="step-num">2.</span> Click <strong>"Create a New App"</strong></p>
      <p><span class="step-num">3.</span> Fill in:</p>
      <p style="margin-top:8px"><strong>App Name:</strong></p>
      <div class="copy-box" onclick="copyText(this)">VeeqoSync - My Shop</div>
      <p><strong>Description:</strong></p>
      <div class="copy-box" onclick="copyText(this)">This application syncs orders between my Etsy shop and my Veeqo inventory management system. It automatically imports new Etsy orders into Veeqo for shipping label creation and fulfillment, pushes tracking information back to Etsy when orders are shipped, and keeps inventory levels synchronized between both platforms. This is a private tool used only for managing my own shop's operations.</div>
      <p><strong>Website URL:</strong></p>
      <div class="copy-box" onclick="copyText(this)">${workerUrl}</div>
      <p><strong>Callback URL (important!):</strong></p>
      <div class="copy-box" onclick="copyText(this)">${workerUrl}/api/oauth/etsy/callback</div>
      <p><span class="step-num">4.</span> Select <strong>"Seller tools"</strong></p>
      <p><span class="step-num">5.</span> Check: <strong>"Upload or edit listings"</strong> and <strong>"Read sales data"</strong></p>
      <p><span class="step-num">6.</span> Agree to terms and create the app</p>
    </div>

    <h2>Step 2: Enter Your API Key</h2>
    <div class="step">
      <p>After creating the app, copy the <strong>Keystring</strong> and paste it below:</p>
      <input type="text" id="etsy-api-key" placeholder="Paste your Etsy API Keystring here" />
    </div>

    <div id="error-msg" class="error hidden"></div>

    <button class="btn-primary" id="connect-btn" onclick="startConnect()">
      Connect Etsy Shop
    </button>
    <p class="info">A new window will open where you'll authorize access to your Etsy shop.</p>
  </div>

  <div id="success-card" class="card success hidden">
    <h2>Shop Connected Successfully!</h2>
    <p>Your Etsy shop is now linked. Orders will start syncing automatically.</p>
    <p style="margin-top:16px; color:#64748b;">You can close this page.</p>
  </div>

  <div id="expired-card" class="card hidden">
    <h2>Link Expired or Invalid</h2>
    <p id="expired-msg" style="color:#64748b;"></p>
  </div>
</div>

<script>
const token = window.location.pathname.split('/setup/')[1];
const API = '/api/setup';

async function init() {
  try {
    const resp = await fetch(API + '/validate/' + token);
    const data = await resp.json();

    if (!resp.ok) {
      document.getElementById('loading-card').classList.add('hidden');
      document.getElementById('expired-card').classList.remove('hidden');
      document.getElementById('expired-msg').textContent = data.error || 'Invalid link';
      return;
    }

    document.getElementById('shop-info').textContent = 'Setting up: ' + data.shopName + ' (' + data.customerName + ')';
    document.getElementById('loading-card').classList.add('hidden');
    document.getElementById('setup-card').classList.remove('hidden');
  } catch (e) {
    document.getElementById('loading-card').innerHTML = '<p class="error">Failed to load. Please try again.</p>';
  }
}

async function startConnect() {
  const apiKey = document.getElementById('etsy-api-key').value.trim();
  if (!apiKey) {
    showError('Please enter your Etsy API Keystring');
    return;
  }

  const btn = document.getElementById('connect-btn');
  btn.disabled = true;
  btn.textContent = 'Connecting...';
  hideError();

  try {
    const resp = await fetch(API + '/oauth-start/' + token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ etsyApiKey: apiKey }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      showError(data.error || 'Failed to start connection');
      btn.disabled = false;
      btn.textContent = 'Connect Etsy Shop';
      return;
    }

    // Open Etsy auth in same window (not popup, to avoid popup blockers)
    window.location.href = data.authUrl;
  } catch (e) {
    showError('Connection failed. Please try again.');
    btn.disabled = false;
    btn.textContent = 'Connect Etsy Shop';
  }
}

function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError() {
  document.getElementById('error-msg').classList.add('hidden');
}

function copyText(el) {
  navigator.clipboard.writeText(el.textContent.replace('Click to copy', '').trim());
  const orig = el.style.background;
  el.style.background = '#d1fae5';
  setTimeout(() => el.style.background = orig, 500);
}

init();
</script>
</body>
</html>`;
}

export default {
  fetch: app.fetch,
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ) {
    ctx.waitUntil(handleScheduled(controller, env));
  },
};
