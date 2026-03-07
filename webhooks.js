import crypto from "crypto";

// Supabase Client für Webhooks
const SUPABASE_URL = process.env.SUPABASE_URL || "https://cagqjtugmeijptpibgaj.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || "dev_secret";

/**
 * Validiert Shopify Webhook HMAC
 */
export function validateWebhookHmac(bodyRaw, hmacHeader) {
  if (!SHOPIFY_API_SECRET || SHOPIFY_API_SECRET === "dev_secret") {
    console.warn("⚠️  Webhook HMAC-Validierung deaktiviert (kein API Secret)");
    return true;
  }

  const calculatedHmac = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET)
    .update(bodyRaw, "utf8")
    .digest("base64");

  return calculatedHmac === hmacHeader;
}

/**
 * Verarbeitet Shopify orders/create Webhook
 */
export async function handleOrdersCreateWebhook(body, shopDomain) {
  try {
    if (!SUPABASE_KEY) {
      throw new Error("SUPABASE_KEY nicht konfiguriert");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const orderId = body.id;
    const orderNumber = body.order_number;
    const customerEmail = body.email;
    const totalPrice = parseFloat(body.total_price) || 0;
    const currency = body.currency || "EUR";

    console.log(`📦 Webhook empfangen: Bestellung #${orderNumber} von ${shopDomain}`);

    // Shop aus Datenbank suchen (basierend auf Domain)
    const { data: shopData, error: shopError } = await supabase
      .from("efro_shops")
      .select("id, shop_domain")
      .eq("shop_domain", shopDomain)
      .limit(1);

    let shopId = null;
    if (shopError) {
      console.error("❌ Fehler beim Shop-Lookup:", shopError.message);
    } else if (shopData && shopData.length > 0) {
      shopId = shopData[0].id;
    }

    // Bestellung in Datenbank speichern
    const orderData = {
      shop_id: shopId,
      shop_domain: shopDomain,
      order_id: orderId,
      order_data: body,
      customer_email: customerEmail,
      total_amount: totalPrice,
      currency: currency,
    };

    const { data, error } = await supabase
      .from("efro_orders")
      .upsert([orderData], { 
        onConflict: "order_id",
        ignoreDuplicates: false 
      })
      .select();

    if (error) {
      console.error("❌ Fehler beim Speichern der Bestellung:", error.message);
      return { success: false, error: error.message };
    }

    console.log(`✅ Bestellung #${orderNumber} gespeichert (ID: ${data[0]?.id || "unknown"})`);
    
    // Optional: Brain-API über neuen Verkauf informieren
    try {
      const brainApiBase = process.env.BRAIN_API_URL || "https://efro-five.vercel.app";
      const brainApiResponse = await fetch(`${brainApiBase}/api/analytics/sale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_domain: shopDomain,
          order_id: orderId,
          amount: totalPrice,
          timestamp: new Date().toISOString()
        })
      });
      
      if (brainApiResponse.ok) {
        console.log("📊 Verkauf an Brain-API gemeldet");
      }
    } catch (brainError) {
      // Nicht kritisch
      console.log("ℹ️  Brain-API nicht erreichbar für Analytics");
    }

    return { success: true, orderId: data[0]?.id };

  } catch (error) {
    console.error("❌ Webhook-Verarbeitung fehlgeschlagen:", error);
    return { success: false, error: error.message };
  }
}
