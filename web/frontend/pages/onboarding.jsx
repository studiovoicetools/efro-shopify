import { useState } from "react";
import {
  Banner,
  Button,
  Card,
  Form,
  FormLayout,
  Layout,
  Page,
  Select,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { BRAIN_API_URL } from "../utils/constants";

const EMPTY_FORM = {
  shopDomain: "",
  brandName: "",
  mainCategory: "",
  targetAudience: "",
  priceLevel: "",
  language: "de",
  country: "",
  currency: "",
  toneOfVoice: "",
  plan: "starter",
};

const LANGUAGE_OPTIONS = [
  { label: "Deutsch", value: "de" },
  { label: "Englisch", value: "en" },
  { label: "Türkisch", value: "tr" },
];

const PLAN_OPTIONS = [
  { label: "Starter", value: "starter" },
  { label: "Pro", value: "pro" },
  { label: "Enterprise", value: "enterprise" },
];

export default function OnboardingPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleReset = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async () => {
    if (!form.shopDomain.trim()) {
      setError("Shop-Domain darf nicht leer sein.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${BRAIN_API_URL}/api/shop/language`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_domain: form.shopDomain.trim(),
          language: form.language || "de",
          brand_name: form.brandName.trim() || null,
          main_category: form.mainCategory.trim() || null,
          target_audience: form.targetAudience.trim() || null,
          price_level: form.priceLevel.trim() || null,
          country: form.country.trim() || null,
          currency: form.currency.trim() || null,
          tone_of_voice: form.toneOfVoice.trim() || null,
          plan: form.plan || "starter",
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Fehler beim Speichern: ${text}`);
      }

      setSuccess(`Shop "${form.shopDomain.trim()}" erfolgreich gespeichert.`);
    } catch (err) {
      setError(err.message || "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page
      title="Shop Onboarding"
      breadcrumbs={[{ content: "Dashboard", url: "/" }]}
    >
      <TitleBar title="Shop Onboarding" />
      <Layout>
        {error && (
          <Layout.Section>
            <Banner
              title="Fehler"
              status="critical"
              onDismiss={() => setError(null)}
            >
              <p>{error}</p>
            </Banner>
          </Layout.Section>
        )}
        {success && (
          <Layout.Section>
            <Banner
              title="Gespeichert"
              status="success"
              onDismiss={() => setSuccess(null)}
            >
              <p>{success}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card sectioned>
            <Form onSubmit={handleSubmit}>
              <FormLayout>
                <TextField
                  label="Shop-Domain"
                  helpText="z. B. mein-shop.myshopify.com"
                  value={form.shopDomain}
                  onChange={(v) => updateField("shopDomain", v)}
                  autoComplete="off"
                  requiredIndicator
                />
                <TextField
                  label="Brand Name"
                  value={form.brandName}
                  onChange={(v) => updateField("brandName", v)}
                  autoComplete="off"
                />
                <FormLayout.Group>
                  <TextField
                    label="Hauptkategorie"
                    value={form.mainCategory}
                    onChange={(v) => updateField("mainCategory", v)}
                    autoComplete="off"
                  />
                  <TextField
                    label="Zielgruppe"
                    value={form.targetAudience}
                    onChange={(v) => updateField("targetAudience", v)}
                    autoComplete="off"
                  />
                </FormLayout.Group>
                <FormLayout.Group>
                  <TextField
                    label="Preislevel"
                    helpText="z. B. niedrig / mittel / hoch"
                    value={form.priceLevel}
                    onChange={(v) => updateField("priceLevel", v)}
                    autoComplete="off"
                  />
                  <Select
                    label="Sprache"
                    options={LANGUAGE_OPTIONS}
                    value={form.language}
                    onChange={(v) => updateField("language", v)}
                  />
                </FormLayout.Group>
                <FormLayout.Group>
                  <TextField
                    label="Land"
                    value={form.country}
                    onChange={(v) => updateField("country", v)}
                    autoComplete="off"
                  />
                  <TextField
                    label="Währung"
                    helpText="z. B. EUR / USD"
                    value={form.currency}
                    onChange={(v) => updateField("currency", v)}
                    autoComplete="off"
                  />
                </FormLayout.Group>
                <TextField
                  label="Tonfall (Tone of Voice)"
                  value={form.toneOfVoice}
                  onChange={(v) => updateField("toneOfVoice", v)}
                  autoComplete="off"
                />
                <Select
                  label="Plan"
                  options={PLAN_OPTIONS}
                  value={form.plan}
                  onChange={(v) => updateField("plan", v)}
                />
                <div style={{ display: "flex", gap: "12px" }}>
                  <Button
                    primary
                    submit
                    loading={saving}
                    disabled={saving}
                  >
                    Shop speichern
                  </Button>
                  <Button onClick={handleReset} disabled={saving}>
                    Formular leeren
                  </Button>
                </div>
              </FormLayout>
            </Form>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
