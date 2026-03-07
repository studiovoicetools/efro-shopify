import { createProxyMiddleware } from "http-proxy-middleware";

export default function setupEfroProxy(app) {
  console.log("🔧 ULTIMATE EFRO Proxy wird eingerichtet...");

  // Health Check
  app.get("/health", (req, res) => {
    res.json({
      status: "healthy",
      service: "efro-ultimate-proxy",
      timestamp: new Date().toISOString(),
      note: "Proxy mit direkter Brain-API Verbindung"
    });
  });

  // ULTIMATE Brain-API Proxy
  const brainProxy = createProxyMiddleware({
    target: "http://localhost:3003",
    changeOrigin: true,
    pathRewrite: {
      '^/efro-api/brain/process': '/api/brain/process'
    },
    headers: {
      'X-API-Key': 'DEMO-SHOP-API-KEY-456',
      'X-Shop-Domain': 'avatarsalespro-dev.myshopify.com'
    },
    onProxyReq: function(proxyReq, req, res) {
      console.log(`[${new Date().toISOString()}] 🔗 Proxy: ${req.method} ${req.url} -> ${proxyReq.path}`);
    },
    onProxyRes: function(proxyRes, req, res) {
      console.log(`[${new Date().toISOString()}] ✅ Response: ${proxyRes.statusCode} ${req.url}`);
    },
    onError: function(err, req, res) {
      console.error(`[${new Date().toISOString()}] ❌ Proxy Error:`, err.message);
      res.status(502).json({
        success: false,
        error: "Brain-API nicht erreichbar",
        details: err.message,
        tip: "Brain-API auf Port 3003 starten: cd ~/efro-new-arch && node server.js"
      });
    },
    timeout: 8000
  });

  // Spezifische Route für /efro-api/brain/process
  app.use('/efro-api/brain/process', brainProxy);

  console.log("✅ ULTIMATE Proxy konfiguriert für /efro-api/brain/process");
}
