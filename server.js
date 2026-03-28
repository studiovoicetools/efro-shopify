'use strict';

// ============================================================
// EFRO Shopify Server - Professional Edition
// Deployed on: Render
// ============================================================

import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import https from 'https';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const app = express();

// ============================================================
// CONFIG
// ============================================================
const PORT                  = process.env.PORT || 8081;
const SHOPIFY_API_KEY       = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET    = process.env.SHOPIFY_API_SECRET;
const SHOPIFY_SCOPES = (process.env.SHOPIFY_APP_SCOPES || 'read_products,write_products')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .join(',');
const APP_URL               = process.env.SHOPIFY_APP_URL;
const REDIRECT_URI          = `${APP_URL}/auth/callback`;
const BRAIN_API_URL         = process.env.BRAIN_API_URL || 'https://efro-brain.vercel.app';
const WIDGET_URL            = process.env.WIDGET_URL || 'https://widget.avatarsalespro.com';

// ============================================================
// SUPABASE
// ============================================================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================================
// MIDDLEWARE
// ============================================================

// RAW body für Webhooks (muss VOR express.json sein)
app.use('/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json());

// ============================================================
// HELPERS
// ============================================================

function validateHmac(params, receivedHmac) {
  const { hmac, signature, ...rest } = params;
  const message = Object.keys(rest)
    .sort()
    .map(k => `${k}=${rest[k]}`)
    .join('&');
  const calculated = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(message)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(calculated, 'hex'),
    Buffer.from(receivedHmac, 'hex')
  );
}

function validateWebhookHmac(rawBody, receivedHmac) {
  if (!receivedHmac) return false;
  const calculated = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(rawBody)
    .digest('base64');
  return calculated === receivedHmac;
}

async function getShopToken(shopDomain) {
  const { data } = await supabase
    .from('shops')
    .select('access_token')
    .eq('shop_domain', shopDomain)
    .single();
  return data?.access_token;
}

async function saveShop(shopDomain, accessToken, shopData) {
  const { error } = await supabase
    .from('shops')
    .upsert({
      shop_domain:   shopDomain,
      access_token:  accessToken,
      language:      shopData.primary_locale || 'de',
      shop_name:     shopData.name || shopDomain,
      email:         shopData.email || null,
      currency:      shopData.currency || 'EUR',
      timezone:      shopData.timezone || 'Europe/Berlin',
      is_active:     true,
      updated_at:    new Date().toISOString()
    }, { onConflict: 'shop_domain' });
  if (error) throw error;
}

async function syncProducts(shopDomain, accessToken) {
  console.log(`🔄 Starte Produkt-Sync für ${shopDomain}`);
  let allProducts = [];
  let url = `https://${shopDomain}/admin/api/2024-10/products.json?limit=250`;

  while (url) {
    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': accessToken }
    });
    const data = await res.json();
    allProducts = allProducts.concat(data.products || []);

    const linkHeader = res.headers.get('Link') || '';
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }

  console.log(`   📦 ${allProducts.length} Produkte gefunden`);

  const syncRes = await fetch(`${BRAIN_API_URL}/api/shopify/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shop_domain: shopDomain, products: allProducts })
  });

  const syncData = await syncRes.json();
  console.log(`   ✅ Sync abgeschlossen:`, syncData);
  return syncData;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Missing token');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed token');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signedPart = `${encodedHeader}.${encodedPayload}`;

  const expectedSignature = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(signedPart)
    .digest('base64url');

  if (
    !crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(encodedSignature)
    )
  ) {
    throw new Error('Invalid token signature');
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  const now = Math.floor(Date.now() / 1000);

  if (!payload.aud || payload.aud !== SHOPIFY_API_KEY) {
    throw new Error('Invalid token audience');
  }
  if (payload.nbf && payload.nbf > now) {
    throw new Error('Token not active yet');
  }
  if (payload.exp && payload.exp <= now) {
    throw new Error('Token expired');
  }
  if (!payload.dest || !String(payload.dest).startsWith('https://')) {
    throw new Error('Invalid token destination');
  }

  return payload;
}

function embeddedAppPage(shop, host = '') {
  const widgetSrc = `${WIDGET_URL}/?shop=${encodeURIComponent(shop)}`;

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="shopify-api-key" content="${SHOPIFY_API_KEY}" />
  <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
  <title>EFRO KI Verkaufsassistent</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #f6f6f7;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #111827;
    }
    .shell {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
      background: #ffffff;
      border-bottom: 1px solid #e5e7eb;
    }
    .title {
      font-size: 16px;
      font-weight: 700;
    }
    .meta {
      font-size: 12px;
      color: #4b5563;
    }
    .status {
      font-size: 12px;
      color: #0369a1;
      background: #e0f2fe;
      border: 1px solid #bae6fd;
      padding: 6px 10px;
      border-radius: 999px;
      white-space: nowrap;
    }
    iframe {
      width: 100%;
      height: calc(100% - 58px);
      border: 0;
      background: #fff;
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="topbar">
      <div>
        <div class="title">EFRO KI Verkaufsassistent</div>
        <div class="meta">Shop: ${shop}</div>
      </div>
      <div class="status" id="session-status">Prüfe App Bridge / Session Token …</div>
    </div>
    <iframe
      id="efro-widget"
      src="${widgetSrc}"
      allow="microphone"
      title="EFRO Widget"
    ></iframe>
  </div>

  <script>
    (async () => {
      const statusEl = document.getElementById('session-status');

      try {
        if (!window.shopify || typeof window.shopify.idToken !== 'function') {
          statusEl.textContent = 'App Bridge geladen, idToken nicht verfügbar';
          statusEl.style.color = '#92400e';
          statusEl.style.background = '#fef3c7';
          statusEl.style.borderColor = '#fcd34d';
          return;
        }

        const token = await window.shopify.idToken();
        const res = await fetch('/api/session-token-check', {
          method: 'GET',
          headers: {
            Authorization: 'Bearer ' + token
          }
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || ('HTTP ' + res.status));
        }

        const data = await res.json();
        statusEl.textContent = 'Embedded OK – Session Token validiert';
        statusEl.style.color = '#166534';
        statusEl.style.background = '#dcfce7';
        statusEl.style.borderColor = '#86efac';

        console.log('✅ Session token validated:', data);
      } catch (err) {
        console.error('❌ Session token check failed:', err);
        statusEl.textContent = 'Session Token Check fehlgeschlagen';
        statusEl.style.color = '#991b1b';
        statusEl.style.background = '#fee2e2';
        statusEl.style.borderColor = '#fca5a5';
      }
    })();
  </script>
</body>
</html>`;
}

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: 'efro-shopify-v6-embedded-root',
    timestamp: new Date().toISOString()
  });
});

// ============================================================
// EMBEDDED APP ROOT + SESSION TOKEN CHECK
// ============================================================
app.get('/', async (req, res) => {
  const shop = String(req.query.shop || '').trim();
  const host = String(req.query.host || '').trim();

  if (!shop) {
    return res.status(200).send('EFRO Shopify App läuft. Öffne /auth?shop=dein-shop.myshopify.com');
  }

  try {
    const accessToken = await getShopToken(shop).catch(() => null);

    if (!accessToken) {
      console.log(`🔐 Kein gespeicherter Token für ${shop} – leite zu /auth weiter`);
      return res.redirect(`/auth?shop=${encodeURIComponent(shop)}`);
    }

    return res.status(200).send(embeddedAppPage(shop, host));
  } catch (err) {
    console.error('❌ Root Route Fehler:', err?.message || err);
    return res.status(500).send('Fehler beim Laden der eingebetteten App');
  }
});

app.get('/api/session-token-check', (req, res) => {
  try {
    const authHeader = req.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : '';

    const payload = verifySessionToken(token);

    return res.status(200).json({
      ok: true,
      dest: payload.dest,
      aud: payload.aud,
      sub: payload.sub || null,
      exp: payload.exp || null
    });
  } catch (err) {
    console.error('❌ Session Token Fehler:', err?.message || err);
    return res.status(401).json({
      ok: false,
      error: err?.message || 'Invalid session token'
    });
  }
});

// ============================================================
// OAUTH ROUTES
// ============================================================

// 1. Installation starten
app.get('/auth', (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).send('Shop parameter fehlt');

  const nonce = crypto.randomBytes(16).toString('hex');
  const installUrl = `https://${shop}/admin/oauth/authorize`
    + `?client_id=${SHOPIFY_API_KEY}`
    + `&scope=${SHOPIFY_SCOPES}`
    + `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
    + `&state=${nonce}`;

  console.log(`🔗 OAuth Start: ${shop}`);
  res.redirect(installUrl);
});

// 2. OAuth Callback
app.get('/auth/callback', async (req, res) => {
  const { shop, code, hmac, state, host, timestamp } = req.query;

  if (!shop || !code || !hmac) {
    return res.status(400).send('Fehlende OAuth Parameter');
  }

  if (!validateHmac({ shop, code, state, host, timestamp }, hmac)) {
    console.error(`❌ HMAC Fehler für Shop: ${shop}`);
    return res.status(401).send('HMAC Validierung fehlgeschlagen');
  }

  try {
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code
      })
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      throw new Error('Kein Access Token erhalten');
    }

    const shopRes = await fetch(`https://${shop}/admin/api/2024-10/shop.json`, {
      headers: { 'X-Shopify-Access-Token': tokenData.access_token }
    });
    const shopData = (await shopRes.json()).shop || {};

    await saveShop(shop, tokenData.access_token, shopData);
    console.log(`✅ Shop installiert: ${shop} | Sprache: ${shopData.primary_locale}`);

    await syncProducts(shop, tokenData.access_token);
    await registerWebhooks(shop, tokenData.access_token);

    const rootUrl = `/?shop=${encodeURIComponent(String(shop))}${host ? `&host=${encodeURIComponent(String(host))}` : ''}`;
    return res.redirect(rootUrl);
  } catch (err) {
    console.error('❌ OAuth Callback Fehler:', err.message);
    res.status(500).send(`<h1>Installationsfehler</h1><p>${err.message}</p>`);
  }
});

// ============================================================
// WEBHOOKS
// ============================================================

async function registerWebhooks(shop, accessToken) {
  const webhooks = [
    { topic: 'app/uninstalled',        address: `${APP_URL}/webhooks/app/uninstalled` },
    { topic: 'products/create',        address: `${APP_URL}/webhooks/products/create` },
    { topic: 'products/update',        address: `${APP_URL}/webhooks/products/update` },
    { topic: 'products/delete',        address: `${APP_URL}/webhooks/products/delete` },
    { topic: 'customers/data_request', address: `${APP_URL}/webhooks/customers/data_request` },
    { topic: 'customers/redact',       address: `${APP_URL}/webhooks/customers/redact` },
    { topic: 'shop/redact',            address: `${APP_URL}/webhooks/shop/redact` }
  ];

  for (const wh of webhooks) {
    try {
      await fetch(`https://${shop}/admin/api/2024-10/webhooks.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ webhook: { topic: wh.topic, address: wh.address, format: 'json' } })
      });
      console.log(`   📌 Webhook registriert: ${wh.topic}`);
    } catch (e) {
      console.warn(`   ⚠️ Webhook Fehler (${wh.topic}):`, e.message);
    }
  }
}

app.post('/webhooks/app/uninstalled', async (req, res) => {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  const shop = req.get('X-Shopify-Shop-Domain');

  if (!validateWebhookHmac(req.body, hmac)) {
    return res.status(401).send('Unauthorized');
  }

  await supabase.from('shops')
    .update({ is_active: false, uninstalled_at: new Date().toISOString() })
    .eq('shop_domain', shop);

  console.log(`🗑️ App deinstalliert: ${shop}`);
  res.status(200).send('OK');
});

app.post('/webhooks/products/create', async (req, res) => {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  const shop = req.get('X-Shopify-Shop-Domain');
  if (!validateWebhookHmac(req.body, hmac)) return res.status(401).send('Unauthorized');

  const accessToken = await getShopToken(shop);
  if (accessToken) await syncProducts(shop, accessToken);

  res.status(200).send('OK');
});

app.post('/webhooks/products/update', async (req, res) => {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  const shop = req.get('X-Shopify-Shop-Domain');
  if (!validateWebhookHmac(req.body, hmac)) return res.status(401).send('Unauthorized');

  const accessToken = await getShopToken(shop);
  if (accessToken) await syncProducts(shop, accessToken);

  res.status(200).send('OK');
});

app.post('/webhooks/products/delete', async (req, res) => {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  const shop = req.get('X-Shopify-Shop-Domain');
  if (!validateWebhookHmac(req.body, hmac)) return res.status(401).send('Unauthorized');

  const accessToken = await getShopToken(shop);
  if (accessToken) await syncProducts(shop, accessToken);

  res.status(200).send('OK');
});

app.post('/webhooks/customers/data_request', (req, res) => {
  console.log('📋 GDPR: customers/data_request');
  res.status(200).send('OK');
});

app.post('/webhooks/customers/redact', (req, res) => {
  console.log('📋 GDPR: customers/redact');
  res.status(200).send('OK');
});

app.post('/webhooks/shop/redact', (req, res) => {
  console.log('📋 GDPR: shop/redact');
  res.status(200).send('OK');
});

// ============================================================
// START
// ============================================================

setInterval(() => {
  https.get("https://app.avatarsalespro.com/health", (res) => {
    console.log(`🏓 Self-ping: ${res.statusCode}`);
  }).on("error", (e) => console.log(`⚠️ Self-ping error: ${e.message}`));
}, 4 * 60 * 1000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 EFRO Shopify Server läuft auf Port ${PORT}`);
  console.log(`🔑 API Key: ${SHOPIFY_API_KEY ? '✅' : '❌'}`);
  console.log(`🔗 App URL: ${APP_URL}`);
  console.log(`📦 Brain API: ${BRAIN_API_URL}`);
  console.log(`🪟 Widget URL: ${WIDGET_URL}`);
});
