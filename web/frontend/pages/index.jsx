import { useEffect, useState } from "react";
import {
  Badge,
  Banner,
  Button,
  Card,
  Layout,
  Page,
  Spinner,
  Text,
  TextContainer,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useNavigate } from "react-router-dom";
import { BRAIN_API_URL } from "../utils/constants";

export default function HomePage() {
  const navigate = useNavigate();
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BRAIN_API_URL}/api/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHealth(data);
    } catch (err) {
      setError(err.message || "Verbindung zur Brain API fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHealth();
  }, []);

  const isHealthy = health?.status === "healthy";
  const productsFound = Number(health?.products_found ?? 0);
  const hasProducts = productsFound > 0;
  const reviewFallbackAnswer = hasProducts
    ? "EFRO ist verbunden. Öffne den Storefront-Widget-Test und frage nach einem passenden Produkt aus deinem Shop-Katalog."
    : "EFRO ist installiert, aber für diesen Review-Shop wurden noch keine Produkte synchronisiert. Füge ein Produkt hinzu oder synchronisiere den Katalog, dann kann EFRO konkrete Empfehlungen testen.";

  return (
    <Page title="EFRO Dashboard">
      <TitleBar title="EFRO Dashboard" />
      <Layout>
        {error && (
          <Layout.Section>
            <Banner
              title="Brain API nicht erreichbar"
              status="critical"
              onDismiss={() => setError(null)}
            >
              <p>{error}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section oneHalf>
          <Card title="Shop-Status" sectioned>
            {loading ? (
              <Spinner size="small" />
            ) : (
              <TextContainer spacing="loose">
                <Text as="p" variant="bodyMd">
                  Status:{" "}
                  <Badge status={isHealthy ? "success" : "critical"}>
                    {isHealthy ? "Aktiv" : "Fehler"}
                  </Badge>
                </Text>
                {health?.version && (
                  <Text as="p" variant="bodySm" color="subdued">
                    Version: {health.version}
                  </Text>
                )}
                {health?.supabase && (
                  <Text as="p" variant="bodySm" color="subdued">
                    Supabase: {health.supabase}
                  </Text>
                )}
              </TextContainer>
            )}
          </Card>
        </Layout.Section>

        <Layout.Section oneHalf>
          <Card title="Produkte" sectioned>
            {loading ? (
              <Spinner size="small" />
            ) : (
              <TextContainer spacing="loose">
                <Text as="p" variant="headingLg">
                  {health?.products_found ?? "–"}
                </Text>
                <Text as="p" variant="bodySm" color="subdued">
                  Produkte in Supabase
                </Text>
                {health?.timestamp && (
                  <Text as="p" variant="bodySm" color="subdued">
                    Letzte Sync:{" "}
                    {new Date(health.timestamp).toLocaleString("de-DE")}
                  </Text>
                )}
              </TextContainer>
            )}
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card title="Testpfad" sectioned>
            <TextContainer spacing="loose">
              <Text as="p" variant="bodyMd">
                EFRO kann im Theme Editor als App Block hinzugefügt und anschließend im Storefront getestet werden.
              </Text>
              <Text as="p" variant="bodyMd">
                Produktstatus:{" "}
                <Badge status={hasProducts ? "success" : "warning"}>
                  {hasProducts ? `${productsFound} Produkte bereit` : "Produkt-Sync erforderlich"}
                </Badge>
              </Text>
              <Text as="p" variant="bodyMd">
                Testfrage: <strong>Welches Produkt empfiehlst du mir?</strong>
              </Text>
              <Text as="p" variant="bodyMd">
                Antwortstatus: {reviewFallbackAnswer}
              </Text>
            </TextContainer>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card title="Schnellzugriff" sectioned>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <Button onClick={() => navigate("/onboarding")}>
                Shop Onboarding
              </Button>
              <Button onClick={() => navigate("/events")}>Event Logs</Button>
              <Button onClick={loadHealth} plain>
                Status aktualisieren
              </Button>
            </div>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
