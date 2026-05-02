import { createProxyMiddleware } from "http-proxy-middleware";

const BRAIN_API_URL = process.env.BRAIN_API_URL || "http://localhost:3003";
const BRAIN_API_KEY = process.env.BRAIN_API_KEY;
const DEFAULT_SHOP_DOMAIN = process.env.SHOP_DOMAIN || process.env.SHOPIFY_DEV_STORE_DOMAIN || "";

function resolveShopDomain(req) {
  return (
    req.get("X-Shop-Domain") ||
    req.get("X-Shopify-Shop-Domain") ||
    req.query?.shop ||
    DEFAULT_SHOP_DOMAIN ||
    "unknown"
  );
}

export default function setupEfroProxy(app) {
  console.log("🔧 EFRO Proxy wird eingerichtet...");

  if (!BRAIN_API_KEY) {
    console.warn("⚠️ BRAIN_API_KEY fehlt; EFRO Brain Proxy wird nicht aktiviert.");
    app.use('/efro-api/brain/process', (req, res) => {
      res.status(503).json({
        success: false,
        error: "EFRO Brain proxy is not configured"
      });
    });
    return;
  }

  // Health Check
  app.get("/health", (req, res) => {
    res.json({
      status: "healthy",
      service: "efro-proxy",
      timestamp: new Date().toISOString(),
      note: "Proxy with environment-based Brain API configuration"
    });
  });

  const brainProxy = createProxyMiddleware({
    target: BRAIN_API_URL,
    changeOrigin: true,
    pathRewrite: {
      '^/efro-api/brain/process': '/api/brain/process'
    },
    onProxyReq: function(proxyReq, req, res) {
      proxyReq.setHeader('X-API-Key', BRAIN_API_KEY);
      proxyReq.setHeader('X-Shop-Domain', resolveShopDomain(req));
      console.log(`[${new Date().toISOString()}] 🔗 Proxy: ${req.method} ${req.url} -> ${proxyReq.path}`);
    },
    onProxyRes: function(proxyRes, req, res) {
      console.log(`[${new Date().toISOString()}] ✅ Response: ${proxyRes.statusCode} ${req.url}`);
    },
    onError: function(err, req, res) {
      console.error(`[${new Date().toISOString()}] ❌ Proxy Error:`, err.message);
      res.status(502).json({
        success: false,
        error: "Backend service unavailable"
      });
    },
    timeout: 8000
  });

  app.use('/efro-api/brain/process', brainProxy);

  console.log("✅ EFRO Proxy configured for /efro-api/brain/process");
}
