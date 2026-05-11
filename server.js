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
import ws from 'ws';
import { createClient } from '@supabase/supabase-js';

const app = express();

// ============================================================
// CONFIG
// ============================================================
const PORT               = process.env.PORT || 8081;
const SHOPIFY_API_KEY    = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SHOPIFY_SCOPES = (process.env.SHOPIFY_APP_SCOPES || 'read_products,write_products')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .join(',');
const APP_URL            = process.env.SHOPIFY_APP_URL;
const REDIRECT_URI       = `${APP_URL}/auth/callback`;
const BRAIN_API_URL      = process.env.BRAIN_API_URL || 'https://efro-brain.vercel.app';
const WIDGET_URL         = process.env.WIDGET_URL || 'https://widget.avatarsalespro.com';
const SHOPIFY_APP_HANDLE = process.env.SHOPIFY_APP_HANDLE || 'efro-ki-verkaufsassistent';
const SHOPIFY_PRODUCT_SYNC_MAX_PAGES = Number(process.env.SHOPIFY_PRODUCT_SYNC_MAX_PAGES || 4000);
const SHOPIFY_PRODUCT_SYNC_MAX_RETRIES = Number(process.env.SHOPIFY_PRODUCT_SYNC_MAX_RETRIES || 3);

// ============================================================
// SUPABASE
// ============================================================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    realtime: {
      transport: ws
    }
  }
);

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(['/webhooks', '/api/gdpr'], express.raw({ type: 'application/json' }));
app.use(express.json());

// ============================================================
// HELPERS
// ============================================================

function isMissingTableError(error) {
  const msg = String(error?.message || '');
  return (
    msg.includes("Could not find the table") ||
    msg.includes("relation") && msg.includes("does not exist")
  );
}

async function getShopRecord(shopDomain) {
  const shopDomainStr = String(shopDomain || '').trim();
  if (!shopDomainStr) return null;

  const tables = ['shops', 'efro_shops'];

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('shop_domain', shopDomainStr)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        console.warn(`⚠️ Tabelle ${table} fehlt, probiere nächste Option`);
        continue;
      }
      throw error;
    }

    if (data) {
      return { table, data };
    }
  }

  return null;
}

async function getShopToken(shopDomain) {
  const record = await getShopRecord(shopDomain);
  return record?.data?.access_token || null;
}

function shopDomainToStoreHandle(shopDomain) {
  return String(shopDomain || '').trim().replace(/\.myshopify\.com$/i, '');
}

function buildManagedPricingPageUrl(shopDomain, appHandle = SHOPIFY_APP_HANDLE) {
  const storeHandle = shopDomainToStoreHandle(shopDomain);
  const safeAppHandle = String(appHandle || '').trim();
  if (!storeHandle || !safeAppHandle) return null;
  return `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}/charges/${encodeURIComponent(safeAppHandle)}/pricing_plans`;
}

function normalizeManagedPricingStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'active') return 'active';
  if (value === 'trialing' || value === 'trial') return 'trialing';
  if (value === 'pending' || value === 'accepted' || value === 'frozen') return 'pending';
  if (value === 'canceled' || value === 'cancelled' || value === 'declined' || value === 'expired') return 'canceled';
  return 'unknown';
}

function mapManagedPricingPlanName(planName) {
  const value = String(planName || '').trim().toLowerCase();
  if (!value) return 'unknown';
  if (value.includes('starter')) return 'starter';
  if (value.includes('growth')) return 'growth';
  if (value.includes('premium')) return 'premium';
  if (value.includes('enterprise') || value.includes('private') || value.includes('managed') || value.includes('custom')) return 'enterprise';
  return 'unknown';
}

function unknownManagedPricingStatus(shopDomain) {
  return {
    shopDomain: String(shopDomain || '').trim(),
    billingProvider: 'shopify_managed_pricing',
    billingStatus: 'unknown',
    efroPlanKey: 'unknown',
    shopifySubscriptionId: null,
    currentPeriodEnd: null,
    test: null,
    lastCheckedAt: new Date().toISOString(),
    pricingPageUrl: buildManagedPricingPageUrl(shopDomain),
    notes: [
      'Read-only Managed Pricing status only.',
      'No appSubscriptionCreate, no charge creation, no hard OAuth billing redirect.',
      'TODO: map stable Shopify plan handles/IDs; localized plan names are not enough.'
    ]
  };
}

async function getManagedPricingStatus(shopDomain, accessToken) {
  const shop = String(shopDomain || '').trim();
  const token = String(accessToken || '').trim();
  if (!shop || !token) return unknownManagedPricingStatus(shop);

  const query = `#graphql
    query EfroReadOnlyManagedPricingStatus {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
          test
          trialDays
          currentPeriodEnd
        }
      }
    }
  `;

  try {
    const response = await fetch(`https://${shop}/admin/api/2026-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify({ query })
    });

    if (!response.ok) return unknownManagedPricingStatus(shop);

    const payload = await response.json();
    const subscriptions = payload?.data?.currentAppInstallation?.activeSubscriptions || [];
    const subscription = subscriptions.find(item => normalizeManagedPricingStatus(item?.status) === 'active')
      || subscriptions.find(item => normalizeManagedPricingStatus(item?.status) === 'trialing')
      || subscriptions[0];

    if (!subscription) return unknownManagedPricingStatus(shop);

    return {
      shopDomain: shop,
      billingProvider: 'shopify_managed_pricing',
      billingStatus: normalizeManagedPricingStatus(subscription.status),
      efroPlanKey: mapManagedPricingPlanName(subscription.name),
      shopifySubscriptionId: subscription.id || null,
      currentPeriodEnd: subscription.currentPeriodEnd || null,
      test: typeof subscription.test === 'boolean' ? subscription.test : null,
      lastCheckedAt: new Date().toISOString(),
      pricingPageUrl: buildManagedPricingPageUrl(shop),
      notes: [
        'Read-only Managed Pricing status only.',
        'No appSubscriptionCreate, no charge creation, no hard OAuth billing redirect.',
        'TODO: map stable Shopify plan handles/IDs; localized plan names are not enough.'
      ]
    };
  } catch (err) {
    return unknownManagedPricingStatus(shop);
  }
}

async function saveShop(shopDomain, accessToken, shopData) {
  const shopDomainStr = String(shopDomain || '').trim();
  const nowIso = new Date().toISOString();

  const shopsPayload = {
    shop_domain:  shopDomainStr,
    access_token: accessToken,
    language:     shopData.primary_locale || 'de',
    shop_name:    shopData.name || shopDomainStr,
    email:        shopData.email || null,
    currency:     shopData.currency || 'EUR',
    timezone:     shopData.timezone || 'Europe/Berlin',
    is_active:    true,
    updated_at:   nowIso
  };

  const { error: shopsError } = await supabase
    .from('shops')
    .upsert(shopsPayload, { onConflict: 'shop_domain' });

  if (!shopsError) {
    return 'shops';
  }

  if (!isMissingTableError(shopsError)) {
    throw shopsError;
  }

  console.warn('⚠️ public.shops fehlt, speichere in efro_shops');

  const efroPayload = {
    shop_domain:   shopDomainStr,
    access_token:  accessToken,
    language:      shopData.primary_locale || 'de',
    currency:      shopData.currency || 'EUR',
    locale:        shopData.primary_locale || 'de',
    installed_at:  nowIso,
    last_seen_at:  nowIso,
    updated_at:    nowIso,
    metadata: {
      shop_name: shopData.name || shopDomainStr,
      email: shopData.email || null,
      timezone: shopData.timezone || 'Europe/Berlin'
    }
  };

  const { error: efroError } = await supabase
    .from('efro_shops')
    .upsert(efroPayload, { onConflict: 'shop_domain' });

  if (efroError) throw efroError;
  return 'efro_shops';
}

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
  if (!SHOPIFY_API_SECRET || !receivedHmac) return false;
  const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
  const calculated = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(raw)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(receivedHmac));
  } catch {
    return false;
  }
}

function parseWebhookPayload(rawBody) {
  try {
    const raw = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '{}');
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

async function insertPrivacyEvent(topic, shop, payload) {
  try {
    const { error } = await supabase
      .from('privacy_events')
      .insert({
        topic,
        shop_domain: shop,
        payload,
        received_at: new Date().toISOString()
      });

    if (error && !isMissingTableError(error)) {
      console.warn(`⚠️ privacy_events insert warning (${topic}):`, error.message);
    }
  } catch (err) {
    console.warn(`⚠️ privacy event warning (${topic}):`, err?.message || err);
  }
}

async function redactCustomerData(shop, payload) {
  const customer = payload?.customer || {};
  const email = customer?.email || payload?.email || null;

  if (!email) return;

  try {
    const { error } = await supabase
      .from('efro_orders')
      .delete()
      .eq('shop_domain', shop)
      .eq('customer_email', email);

    if (error && !isMissingTableError(error)) {
      console.warn('⚠️ customer redact warning:', error.message);
    }
  } catch (err) {
    console.warn('⚠️ customer redact warning:', err?.message || err);
  }
}

async function redactShopData(shop) {
  const nowIso = new Date().toISOString();

  for (const table of ['shops', 'efro_shops']) {
    try {
      const { error } = await supabase
        .from(table)
        .update({
          access_token: null,
          is_active: false,
          uninstalled_at: nowIso,
          updated_at: nowIso
        })
        .eq('shop_domain', shop);

      if (error && !isMissingTableError(error)) {
        console.warn(`⚠️ shop redact warning (${table}):`, error.message);
      }
    } catch (err) {
      console.warn(`⚠️ shop redact warning (${table}):`, err?.message || err);
    }
  }

  try {
    const { error } = await supabase
      .from('efro_orders')
      .delete()
      .eq('shop_domain', shop);

    if (error && !isMissingTableError(error)) {
      console.warn('⚠️ shop orders redact warning:', error.message);
    }
  } catch (err) {
    console.warn('⚠️ shop orders redact warning:', err?.message || err);
  }
}

async function processGdprWebhook(topic, shop, payload) {
  await insertPrivacyEvent(topic, shop, payload);

  if (topic === 'customers/redact') {
    await redactCustomerData(shop, payload);
  }

  if (topic === 'shop/redact') {
    await redactShopData(shop);
  }
}

function handleGdprWebhook(topic) {
  return async (req, res) => {
    const hmac = req.get('X-Shopify-Hmac-Sha256');
    const shop = req.get('X-Shopify-Shop-Domain') || 'unknown-shop';

    if (!validateWebhookHmac(req.body, hmac)) {
      console.warn(`❌ GDPR Webhook HMAC invalid: ${topic} | ${shop}`);
      return res.status(401).send('Unauthorized');
    }

    const payload = parseWebhookPayload(req.body);
    await processGdprWebhook(topic, shop, payload);

    console.log(`📋 GDPR Webhook OK: ${topic} | ${shop}`);
    return res.status(200).send('OK');
  };
}

async function fetchShopifyProductsPage(url, accessToken, attempt = 1) {
  const res = await fetch(url, {
    headers: { 'X-Shopify-Access-Token': accessToken }
  });

  if (res.status === 429 && attempt < SHOPIFY_PRODUCT_SYNC_MAX_RETRIES) {
    const retryAfter = Number(res.headers.get('Retry-After') || 1);
    await new Promise(resolve => setTimeout(resolve, Math.min(retryAfter, 5) * 1000));
    return fetchShopifyProductsPage(url, accessToken, attempt + 1);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Shopify products page failed ${res.status}: ${detail.slice(0, 300)}`);
  }

  return res;
}

async function syncProducts(shopDomain, accessToken) {
  console.log(`🔄 Starte Produkt-Sync für ${shopDomain}`);
  let allProducts = [];
  let url = `https://${shopDomain}/admin/api/2026-01/products.json?limit=250`;
  let pageCount = 0;

  while (url) {
    pageCount += 1;
    if (pageCount > SHOPIFY_PRODUCT_SYNC_MAX_PAGES) {
      throw new Error(`Shopify product sync exceeded max pages (${SHOPIFY_PRODUCT_SYNC_MAX_PAGES}) for ${shopDomain}`);
    }

    const res = await fetchShopifyProductsPage(url, accessToken);
    const data = await res.json();
    allProducts = allProducts.concat(data.products || []);

    const linkHeader = res.headers.get('Link') || '';
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }

  console.log(`   📦 ${allProducts.length} Produkte gefunden auf ${pageCount} Seiten`);

  const syncRes = await fetch(`${BRAIN_API_URL}/api/shopify/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shop_domain: shopDomain, products: allProducts, source: 'efro-shopify', page_count: pageCount })
  });

  if (!syncRes.ok) {
    const detail = await syncRes.text().catch(() => '');
    throw new Error(`Brain Shopify sync failed ${syncRes.status}: ${detail.slice(0, 300)}`);
  }

  const syncData = await syncRes.json();
  console.log(`   ✅ Sync abgeschlossen:`, { ...syncData, page_count: pageCount, product_count: allProducts.length });
  return { ...syncData, page_count: pageCount, product_count: allProducts.length };
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') throw new Error('Missing token');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed token');

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

  if (!payload.aud || payload.aud !== SHOPIFY_API_KEY) throw new Error('Invalid token audience');
  if (payload.nbf && payload.nbf > now) throw new Error('Token not active yet');
  if (payload.exp && payload.exp <= now) throw new Error('Token expired');
  if (!payload.dest || !String(payload.dest).startsWith('https://')) throw new Error('Invalid token destination');

  return payload;
}

function embeddedAppPage(shop, host = '') {
  const widgetSrc = `${WIDGET_URL}/?shop=${encodeURIComponent(shop)}`;
  const pricingPageUrl = buildManagedPricingPageUrl(shop);
  const billingCtaHtml = pricingPageUrl
    ? '<a href="' + pricingPageUrl + '" target="_top" rel="noopener">Plan in Shopify verwalten</a>'
    : '<span>Plan-Link TODO: App Handle konfigurieren</span>';

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
    .title { font-size: 16px; font-weight: 700; }
    .meta { font-size: 12px; color: #4b5563; }
    .status {
      font-size: 12px;
      color: #0369a1;
      background: #e0f2fe;
      border: 1px solid #bae6fd;
      padding: 6px 10px;
      border-radius: 999px;
      white-space: nowrap;
    }
    .billing-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 16px;
      background: #fff7ed;
      border-bottom: 1px solid #fed7aa;
      font-size: 12px;
    }
    .billing-card strong { font-size: 13px; }
    .billing-card a, .billing-card span {
      color: #9a3412;
      font-weight: 700;
      text-decoration: none;
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
    <div class="billing-card">
      <div>
        <strong>Shopify Billing: Managed Pricing</strong><br />
        Status: <span id="billing-status">unknown</span> · EFRO Plan: <span id="billing-plan">unknown</span>
      </div>
      ${billingCtaHtml}
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

        fetch('/api/billing/managed-pricing/status?shop=' + encodeURIComponent('${shop}'))
          .then(billingRes => billingRes.ok ? billingRes.json() : null)
          .then(billingData => {
            if (!billingData) return;
            const billingStatusEl = document.getElementById('billing-status');
            const billingPlanEl = document.getElementById('billing-plan');
            if (billingStatusEl) billingStatusEl.textContent = billingData.billingStatus || 'unknown';
            if (billingPlanEl) billingPlanEl.textContent = billingData.efroPlanKey || 'unknown';
          })
          .catch(() => {});

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
app.get('/healthz', (req, res) => {
  res.status(200).type('text/plain').send('ok');
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: 'efro-shopify-v7-efro-shops-fallback',
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

app.get('/api/billing/managed-pricing/status', async (req, res) => {
  const shop = String(req.query.shop || '').trim();

  try {
    const accessToken = await getShopToken(shop).catch(() => null);
    const billingStatus = await getManagedPricingStatus(shop, accessToken);
    return res.status(200).json(billingStatus);
  } catch (err) {
    return res.status(200).json(unknownManagedPricingStatus(shop));
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

    const shopRes = await fetch(`https://${shop}/admin/api/2026-01/shop.json`, {
      headers: { 'X-Shopify-Access-Token': tokenData.access_token }
    });
    const shopData = (await shopRes.json()).shop || {};

    const savedInTable = await saveShop(shop, tokenData.access_token, shopData);
    console.log(`✅ Shop installiert: ${shop} | Sprache: ${shopData.primary_locale} | gespeichert in: ${savedInTable}`);

    await syncProducts(shop, tokenData.access_token);
    await registerOperationalWebhooks(shop, tokenData.access_token);

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
async function registerOperationalWebhooks(shop, accessToken) {
  const webhooks = [
    { topic: 'app/uninstalled', address: `${APP_URL}/webhooks/app/uninstalled` },
    { topic: 'products/create', address: `${APP_URL}/webhooks/products/create` },
    { topic: 'products/update', address: `${APP_URL}/webhooks/products/update` },
    { topic: 'products/delete', address: `${APP_URL}/webhooks/products/delete` }
  ];

  for (const wh of webhooks) {
    try {
      await fetch(`https://${shop}/admin/api/2026-01/webhooks.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ webhook: { topic: wh.topic, address: wh.address, format: 'json' } })
      });
      console.log(`   📌 Operational webhook registered: ${wh.topic}`);
    } catch (e) {
      console.warn(`   ⚠️ Operational webhook error (${wh.topic}):`, e.message);
    }
  }
}

app.post('/webhooks/app/uninstalled', async (req, res) => {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  const shop = req.get('X-Shopify-Shop-Domain');

  if (!validateWebhookHmac(req.body, hmac)) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const { error } = await supabase
      .from('efro_shops')
      .update({ updated_at: new Date().toISOString() })
      .eq('shop_domain', shop);

    if (error && !isMissingTableError(error)) {
      console.warn('⚠️ efro_shops update Fehler bei uninstall:', error.message);
    }
  } catch (err) {
    console.warn('⚠️ uninstall fallback warning:', err?.message || err);
  }

  try {
    const { error } = await supabase
      .from('shops')
      .update({ is_active: false, uninstalled_at: new Date().toISOString() })
      .eq('shop_domain', shop);

    if (error && !isMissingTableError(error)) {
      console.warn('⚠️ shops update Fehler bei uninstall:', error.message);
    }
  } catch (err) {
    console.warn('⚠️ uninstall shops warning:', err?.message || err);
  }

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

app.post('/webhooks/customers/data_request', handleGdprWebhook('customers/data_request'));
app.post('/webhooks/customers/redact', handleGdprWebhook('customers/redact'));
app.post('/webhooks/shop/redact', handleGdprWebhook('shop/redact'));

app.post('/api/gdpr/customers-data-request', handleGdprWebhook('customers/data_request'));
app.post('/api/gdpr/customers-redact', handleGdprWebhook('customers/redact'));
app.post('/api/gdpr/shop-redact', handleGdprWebhook('shop/redact'));


app.get('/privacy', (req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Datenschutzerklärung – EFRO KI Verkaufsassistent</title>
</head>
<body style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; max-width: 860px; margin: 40px auto; padding: 0 20px; line-height: 1.55;">
  <h1>Datenschutzerklärung – EFRO KI Verkaufsassistent</h1>
  <p>EFRO KI Verkaufsassistent verarbeitet Shop- und Produktdaten, um Händlern einen KI-gestützten Verkaufsassistenten bereitzustellen.</p>

  <h2>Verarbeitete Daten</h2>
  <p>Die App kann Shop-Domain, Shop-Metadaten, Produktdaten, Installationsstatus und technische Ereignisse verarbeiten. Sofern für Funktionen erforderlich, können auch Bestell- oder Kundendaten verarbeitet werden.</p>

  <h2>Zweck der Verarbeitung</h2>
  <p>Die Daten werden genutzt, um Produkte zu synchronisieren, KI-gestützte Produktempfehlungen und Chat-Antworten für Händler bereitzustellen, App-Funktionen zu betreiben, Fehler zu erkennen und Händleranfragen zu unterstützen.</p>

  <h2>Externe Dienste</h2>
  <p>Die App nutzt EFRO-Dienste zur Verarbeitung von Produkt- und Chat-Funktionen. Daten werden nur zur Bereitstellung der App-Funktionalität verarbeitet.</p>

  <h2>Datenschutz-Webhooks</h2>
  <p>Die App verarbeitet Shopify-Privacy-Compliance-Webhooks für Kundendatenanfragen, Kundenlöschung und Shoplöschung. Gültige Shopify-Webhooks werden per HMAC geprüft.</p>

  <h2>Aufbewahrung und Löschung</h2>
  <p>Personenbezogene Daten werden nur so lange gespeichert, wie sie für die App-Funktion, Sicherheit, Fehleranalyse oder rechtliche Pflichten erforderlich sind. Bei gültigen Löschanfragen werden betroffene Daten best-effort gelöscht oder anonymisiert.</p>

  <h2>Kontakt</h2>
  <p>Datenschutzanfragen können per E-Mail an <a href="mailto:support@avatarsalespro.com">support@avatarsalespro.com</a> gestellt werden.</p>
</body>
</html>`);
});

app.get('/support', (req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Support – EFRO KI Verkaufsassistent</title>
</head>
<body style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; max-width: 860px; margin: 40px auto; padding: 0 20px; line-height: 1.55;">
  <h1>Support – EFRO KI Verkaufsassistent</h1>
  <p>Wir unterstützen Händler bei Installation, Konfiguration, Datenschutzanfragen und technischen Problemen mit der Shopify-App.</p>

  <h2>Kontakt</h2>
  <p>E-Mail: <a href="mailto:support@avatarsalespro.com">support@avatarsalespro.com</a></p>

  <h2>Bitte angeben</h2>
  <ul>
    <li>Shop-Domain</li>
    <li>Beschreibung des Problems oder der Frage</li>
    <li>Relevante Screenshots oder Fehlermeldungen, falls vorhanden</li>
  </ul>

  <h2>Datenschutz</h2>
  <p>Datenschutzanfragen können ebenfalls über diese Support-Adresse gestellt werden. Weitere Informationen stehen in der <a href="/privacy">Datenschutzerklärung</a>.</p>
</body>
</html>`);
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
