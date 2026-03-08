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
const SHOPIFY_SCOPES        = process.env.SHOPIFY_APP_SCOPES || 'read_products,write_products';
const APP_URL               = process.env.SHOPIFY_APP_URL;
const REDIRECT_URI          = `${APP_URL}/auth/callback`;
const BRAIN_API_URL         = process.env.BRAIN_API_URL || 'https://efro-brain.vercel.app';

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

    // Pagination
    const linkHeader = res.headers.get('Link') || '';
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }

  console.log(`   📦 ${allProducts.length} Produkte gefunden`);

  // Zur Brain-API senden
  const syncRes = await fetch(`${BRAIN_API_URL}/api/shopify/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shop_domain: shopDomain, products: allProducts })
  });

  const syncData = await syncRes.json();
  console.log(`   ✅ Sync abgeschlossen:`, syncData);
  return syncData;
}

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: 'efro-shopify-v5-professional',
    timestamp: new Date().toISOString()
  });
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

  // HMAC validieren
  if (!validateHmac({ shop, code, state, host, timestamp }, hmac)) {
    console.error(`❌ HMAC Fehler für Shop: ${shop}`);
    return res.status(401).send('HMAC Validierung fehlgeschlagen');
  }

  try {
    // Access Token holen
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

    // Shop-Details von Shopify holen (inkl. primary_locale)
    const shopRes = await fetch(`https://${shop}/admin/api/2024-10/shop.json`, {
      headers: { 'X-Shopify-Access-Token': tokenData.access_token }
    });
    const shopData = (await shopRes.json()).shop || {};

    // In Supabase speichern
    await saveShop(shop, tokenData.access_token, shopData);
    console.log(`✅ Shop installiert: ${shop} | Sprache: ${shopData.primary_locale}`);

    // Produkte synchronisieren
    await syncProducts(shop, tokenData.access_token);

    // Webhooks registrieren
    await registerWebhooks(shop, tokenData.access_token);

    // Erfolgsseite
    res.send(successPage(shop));

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
    { topic: 'app/uninstalled',       address: `${APP_URL}/webhooks/app/uninstalled` },
    { topic: 'products/create',       address: `${APP_URL}/webhooks/products/create` },
    { topic: 'products/update',       address: `${APP_URL}/webhooks/products/update` },
    { topic: 'products/delete',       address: `${APP_URL}/webhooks/products/delete` },
    { topic: 'customers/data_request',address: `${APP_URL}/webhooks/customers/data_request` },
    { topic: 'customers/redact',      address: `${APP_URL}/webhooks/customers/redact` },
    { topic: 'shop/redact',           address: `${APP_URL}/webhooks/shop/redact` }
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

// App deinstalliert
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

// Produkt erstellt/aktualisiert
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

// GDPR Pflicht-Webhooks
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
// SUCCESS PAGE
// ============================================================
function successPage(shop) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EFRO – Installation erfolgreich</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f4f6f8; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; }
    .card { background: white; padding: 48px; border-radius: 16px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.08); text-align: center; max-width: 480px; }
    .icon { font-size: 64px; margin-bottom: 24px; }
    h1 { color: #1a1a1a; font-size: 28px; margin-bottom: 12px; }
    p { color: #555; margin-bottom: 8px; line-height: 1.6; }
    .shop { background: #f0f9ff; border: 1px solid #bae6fd;
            padding: 12px 20px; border-radius: 8px; margin: 20px 0;
            font-weight: 600; color: #0369a1; }
    .btn { display: inline-block; background: #5c6ac4; color: white;
           padding: 14px 28px; border-radius: 8px; text-decoration: none;
           font-size: 16px; font-weight: 600; margin-top: 24px;
           transition: background 0.2s; }
    .btn:hover { background: #4959bd; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🎉</div>
    <h1>EFRO erfolgreich installiert!</h1>
    <p>Dein KI-Verkaufsassistent ist jetzt aktiv für:</p>
    <div class="shop">🔗 ${shop}</div>
    <p>Produkte wurden synchronisiert und der Avatar ist bereit.</p>
    <a href="https://${shop}/admin/apps" class="btn">⚙️ Zurück zum Shopify-Admin</a>
  </div>
  <script>setTimeout(() => { window.location.href = 'https://${shop}/admin/apps'; }, 6000);</script>
</body>
</html>`;
}

// ============================================================
// START
// ============================================================

// Self-Ping alle 4 Min damit Render nicht einschläft
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
});
