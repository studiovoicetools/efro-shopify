# EFRO Shopify App

EFRO Shopify App — handles OAuth, product sync, GDPR webhooks, and admin UI. Also contains the Shopify Theme Extension that embeds the widget into stores.

## Tech Stack

- **Runtime**: Node.js 20
- **Server**: Express
- **Shopify**: Shopify API (OAuth, Webhooks)
- **Database**: Supabase (PostgreSQL)
- **Frontend**: React + Shopify Polaris + Vite
- **HTTP client**: node-fetch
- **Deploy**: Render

## Quick Start

```bash
npm install
cp .env.example .env
# Fill in .env with your values
npm start
```

## OAuth Flow

1. Merchant visits `/auth?shop=<shop>.myshopify.com`
2. Server redirects to Shopify OAuth authorization page
3. Shopify redirects back to `/auth/callback` with authorization code
4. Server exchanges code for access token, saves shop to Supabase, syncs products, registers webhooks

## Webhook Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /webhooks/orders/create` | New order created |
| `POST /webhooks/products/create` | Product created — triggers sync |
| `POST /webhooks/products/update` | Product updated — triggers sync |
| `POST /webhooks/products/delete` | Product deleted — triggers sync |
| `POST /webhooks/app/uninstalled` | App uninstalled |
| `POST /webhooks/customers/data_request` | GDPR: customer data request |
| `POST /webhooks/customers/redact` | GDPR: customer data redact |
| `POST /webhooks/shop/redact` | GDPR: shop data redact |

## Health Check

`GET /health` — returns JSON with status, version, and timestamp.

## Product Sync

Products are automatically synced to the Brain API after:
- Successful OAuth callback (initial install)
- `products/create` webhook
- `products/update` webhook
- `products/delete` webhook

## Admin UI (`web/frontend/`)

React app built with Shopify Polaris, served via Vite. Pages:

- `/` — Dashboard with shop status and product count
- `/onboarding` — Shop onboarding form
- `/events` — Event logs viewer

## Shopify Theme Extension (`extensions/efro-embed/`)

Liquid + JS theme extension that embeds the EFRO widget iframe into Shopify storefronts.

## Deploy

Deployed on Render at `https://app.avatarsalespro.com` (Port 8081).

Auto-deploys from the `main` branch via `render.yaml`.

## Environment Variables

```
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_APP_URL=https://app.avatarsalespro.com
SHOPIFY_APP_SCOPES=read_products,read_product_listings,read_customers,read_orders
BRAIN_API_URL=https://efro-five.vercel.app
BRAIN_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
PORT=8081
```