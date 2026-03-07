import { useCallback, useEffect, useState } from "react";
import {
  Banner,
  Button,
  Card,
  DataTable,
  FormLayout,
  Layout,
  Page,
  Select,
  Spinner,
  TextField,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { BRAIN_API_URL } from "../utils/constants";

const LIMIT_OPTIONS = [
  { label: "50", value: "50" },
  { label: "100", value: "100" },
  { label: "200", value: "200" },
];

export default function EventsPage() {
  const [events, setEvents] = useState([]);
  const [shopDomain, setShopDomain] = useState("");
  const [limit, setLimit] = useState("50");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ limit });
    if (shopDomain.trim()) {
      params.set("shopDomain", shopDomain.trim());
    }

    try {
      const res = await fetch(
        `${BRAIN_API_URL}/api/admin/events?${params.toString()}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const json = await res.json();
      const raw = Array.isArray(json.events) ? json.events : [];
      const sorted = [...raw].sort((a, b) => {
        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
        const db = b.created_at ? new Date(b.created_at).getTime() : 0;
        return db - da;
      });
      setEvents(sorted);
    } catch (err) {
      setError(err.message || "Unbekannter Fehler");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [limit, shopDomain]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const rows = events.map((ev) => {
    let zeit = "–";
    if (ev.created_at) {
      try {
        zeit = new Date(ev.created_at).toLocaleString("de-DE");
      } catch (e) {
        console.warn("Ungültiges Datum:", ev.created_at, e);
      }
    }
    return [
      zeit,
      ev.shop_domain || "–",
      ev.user_text
        ? ev.user_text.length > 60
          ? ev.user_text.slice(0, 60) + "…"
          : ev.user_text
        : "–",
      ev.intent || "–",
      ev.product_count ?? "–",
      ev.had_error ? "Ja" : "Nein",
    ];
  });

  return (
    <Page
      title="Event Logs"
      breadcrumbs={[{ content: "Dashboard", url: "/" }]}
    >
      <TitleBar title="Event Logs" />
      <Layout>
        {error && (
          <Layout.Section>
            <Banner
              title="Fehler beim Laden"
              status="critical"
              onDismiss={() => setError(null)}
            >
              <p>{error}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card sectioned>
            <FormLayout>
              <FormLayout.Group>
                <TextField
                  label="Shop-Domain (optional)"
                  placeholder="z. B. test-shop.myshopify.com"
                  value={shopDomain}
                  onChange={setShopDomain}
                  autoComplete="off"
                />
                <Select
                  label="Limit"
                  options={LIMIT_OPTIONS}
                  value={limit}
                  onChange={setLimit}
                />
              </FormLayout.Group>
              <Button onClick={loadEvents} loading={loading} disabled={loading}>
                Neu laden
              </Button>
            </FormLayout>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            {loading ? (
              <div style={{ padding: "40px", textAlign: "center" }}>
                <Spinner size="large" />
              </div>
            ) : events.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center" }}>
                <Text as="p" color="subdued">
                  Keine Events gefunden.
                </Text>
              </div>
            ) : (
              <DataTable
                columnContentTypes={[
                  "text",
                  "text",
                  "text",
                  "text",
                  "numeric",
                  "text",
                ]}
                headings={[
                  "Zeit",
                  "Shop",
                  "User Text",
                  "Intent",
                  "Produkte",
                  "Fehler?",
                ]}
                rows={rows}
              />
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
