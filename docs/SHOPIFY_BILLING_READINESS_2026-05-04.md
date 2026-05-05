# Shopify Billing Readiness — 2026-05-04

## 1. Aktueller Code-Befund

Status: Readiness-/Contract-Dokumentation. Keine Runtime-Billing-Aktivierung, keine echten Charges, keine Partner-Dashboard-Änderung, kein Production Deploy.

Gelesen/geprüft:

- `README.md`
- `shopify.app.toml`
- `server.js`
- `web/privacy.js`
- vorhandene Repo-Struktur

Befund:

- OAuth ist vorhanden: `/auth` und `/auth/callback`.
- Nach OAuth werden Shopdaten gespeichert, Produkte synchronisiert und operative Webhooks registriert.
- `app/uninstalled` ist registriert und markiert den Shop in Tabellen best-effort als inaktiv bzw. aktualisiert ihn.
- Privacy/GDPR-Webhooks sind in `shopify.app.toml` konfiguriert und in `server.js` implementiert.
- Keine Hinweise auf Shopify Managed Pricing im Code gefunden.
- Keine Billing-API-Implementierung gefunden.
- Kein `appSubscriptionCreate` gefunden.
- Kein `currentAppInstallation` / `activeSubscriptions`-Check gefunden.
- Kein Billing-Gate direkt nach OAuth gefunden.
- Kein Redirect zur Shopify Pricing Page gefunden.
- Kein Plan-/Feature-Gating gefunden.
- Kein Billing-Status-Sync zu `efro` gefunden.

Review-relevante Beobachtung: Der aktuelle Code ist auf Installation, Datenschutz, Produkt-Sync und Embedded-App-Basis fokussiert. Jede Billing-Aktivierung sollte erst nach separatem Review-Gate und ohne Änderung laufender Compliance-Pfade erfolgen.

## 2. Managed Pricing vs Billing API Empfehlung

### Option A: Shopify Managed Pricing

Vorteile:

- Geringeres technisches Risiko für den aktuellen Review-Zustand.
- Shopify-native Pricing-/Plan-Auswahl im Partner-/App-Kontext.
- Weniger eigene Subscription-Lifecycle-Logik in `efro-shopify`.
- Besser geeignet als erster Schritt, wenn die App gerade review-sensibel ist.

Nachteile:

- Setup Fees, Pilot-Angebot und Enterprise-Sonderpreise passen nicht sauber in einfache monatliche/jährliche Pläne.
- Partner-Dashboard-Konfiguration muss separat erfolgen und kann nicht aus diesem Repo heraus versioniert werden.
- EFRO braucht trotzdem Status-Gating, Plan-Mapping und Sync zu `efro`.

Notwendige App-Gating-Logik:

- Nach OAuth Billing-Status lesen oder aus Shopify-Kontext ableiten.
- Falls kein aktiver Plan vorhanden: kontrolliert zur Shopify Pricing Page führen oder Embedded-App-Seite mit klarer Handlungsaufforderung zeigen.
- Feature-Zugriff im Admin und später im Widget anhand normalisiertem `planKey` und `billingStatus` begrenzen.

### Option B: Shopify Billing API

Vorteile:

- Vollständig versionierbare Billing-Flows im Code.
- Direkte Kontrolle über `appSubscriptionCreate`, `confirmationUrl`, Status-Checks, Planwechsel und Reinstall-Flows.
- Später besser geeignet für Usage Charges / cappedAmount, falls EFRO Usage Billing braucht.

Nachteile:

- Höhere technische Komplexität und höheres Review-Risiko.
- Fehler im OAuth-/Billing-Redirect können Installation blockieren.
- Subscription Lifecycle, Kündigung, Reinstall und Planwechsel müssen robust implementiert und getestet werden.
- Setup Fee / Pilot bleiben auch hier Sonderfälle.

Empfehlung für EFRO: **zuerst Shopify Managed Pricing** für reguläre Shopify-Pläne vorbereiten. Billing API erst als Phase 2 prüfen, wenn Review stabil ist und Usage Billing wirklich benötigt wird.

## 3. Empfohlenes EFRO Plan-Mapping

EFRO Commercial Plans:

- Starter: 399 EUR/Monat + 990 EUR Setup
- Growth: 899 EUR/Monat + 2.900 EUR Setup
- Premium: 1.790 EUR/Monat + 5.900 EUR Setup
- Enterprise: ab 3.500 EUR/Monat + ab 10.000 EUR Setup
- Pilot: 990 EUR einmalig

Shopify Mapping:

| EFRO Plan | Shopify Managed Pricing | Behandlung |
| --- | --- | --- |
| Starter | monthly plan | regulärer Shopify-Plan |
| Growth | monthly plan | regulärer Shopify-Plan |
| Premium | monthly plan | regulärer Shopify-Plan |
| Enterprise | managed/manual | manuelle Freigabe, ggf. Shopify managed/custom pricing |
| Pilot | nicht primär Shopify | Stripe/manual oder separate Freigabe; nicht als Standard-Shopify-Plan starten |

Setup Fees passen nicht sauber in Managed Pricing. Empfehlung: Setup Fee zunächst manuell/vertraglich behandeln oder als separaten, klar geprüften Billing-Mechanismus später modellieren. Keine Setup Fee im aktuellen Code erzwingen.

## 4. Billing Gate Design

Minimal sicheres Design:

1. OAuth bleibt stabil und unverändert.
2. Nach erfolgreicher Installation wird Billing-Status best-effort gelesen oder initial `manual_review`/`incomplete` gesetzt.
3. Embedded App zeigt nur sichere Onboarding-/Status-UI, wenn kein aktiver Plan vorhanden ist.
4. Produkt-Sync darf review-sicher bleiben, aber kostenintensive EFRO-Funktionen werden erst bei aktivem Plan freigeschaltet.
5. Gating-Schlüssel: `shopDomain`, `planKey`, `billingStatus`, `currentPeriodStart`, `currentPeriodEnd`.

Billing Status:

- `trialing`
- `active`
- `past_due`
- `canceled`
- `incomplete`
- `manual_review`
- `free_internal`

Kein Live-Redirect ohne getestete Shopify-Review-Kompatibilität.

## 5. Billing Status Sync Contract zu `efro`

`efro-shopify` sollte später normalisierte Billing-Daten an `efro` synchronisieren. Der Sync darf nur serverseitig, signiert und idempotent erfolgen.

Payload-Vorschlag:

```json
{
  "source": "efro-shopify",
  "shopDomain": "example.myshopify.com",
  "shopifySubscriptionId": "gid://shopify/AppSubscription/...",
  "planKey": "starter",
  "billingStatus": "active",
  "currentPeriodStart": "2026-05-01T00:00:00.000Z",
  "currentPeriodEnd": "2026-06-01T00:00:00.000Z",
  "cappedAmount": null,
  "usageLimit": null,
  "updatedAt": "2026-05-04T00:00:00.000Z"
}
```

Idempotency Key:

- `shopDomain + shopifySubscriptionId + currentPeriodEnd + billingStatus`

Fehlerverhalten:

- Sync-Fehler dürfen Shopify OAuth nicht hart blockieren.
- Fehler müssen geloggt und wiederholbar sein.
- `efro` bleibt Quelle für globale Workspace-/Usage-Caps, Shopify bleibt Quelle für Shopify-Billing-Zustand.

## 6. Reinstall / Uninstall / Planwechsel Verhalten

Reinstall:

- Shop anhand `shopDomain` wiedererkennen.
- Access Token aktualisieren.
- Billing-Status erneut prüfen/synchronisieren.
- Nicht automatisch alten Plan als aktiv annehmen.

Uninstall:

- Aktuell wird der Shop best-effort inaktiv markiert.
- Später zusätzlich Billing-Sync an `efro`: `billingStatus = canceled` oder `manual_review`, abhängig vom Shopify-Status.
- Keine eigene Charge-Kündigung ohne Shopify-Lifecycle-Signal.

Planwechsel:

- Managed Pricing: Planwechsel primär über Shopify Pricing UX.
- App muss nach Rückkehr den Plan neu lesen und an `efro` syncen.
- Feature-Gates erst nach bestätigtem aktivem Status hochstufen.

Kündigung:

- Zugriff auf kostenintensive Features sperren.
- Basisdaten für Datenschutz-/Support-Zwecke nur nach Policy behalten.

## 7. Risiken für Shopify Review

- Billing-Redirects direkt im OAuth-Callback können Installation und Review-Tests blockieren.
- Ungetestete `appSubscriptionCreate`-Flows können zu Broken-Install- oder Broken-Embedded-App-Befunden führen.
- Setup Fees und Pilot-Angebote können unklar wirken, wenn sie nicht sauber in Shopify Pricing erklärt sind.
- Externe Billing- oder Stripe-Flows innerhalb der Shopify-App können review-sensibel sein.
- Feature-Gating darf Datenschutz-, Support-, Health- und Pflichtseiten nicht blockieren.
- App-Uninstall- und GDPR-Webhooks dürfen durch Billing-Logik nicht regressieren.

## 8. Sichere nächste Implementierungsschritte

1. Partner-Dashboard-seitig Managed Pricing für Starter/Growth/Premium prüfen, aber noch nicht in Production schalten.
2. Kleine read-only Billing-Status-Helper in separatem Branch bauen: keine Charges, kein Redirect.
3. Admin-UI Billing-Status-Karte ergänzen: `active`, `trialing`, `manual_review`, `incomplete`.
4. Signierten Sync-Endpoint zu `efro` als Contract/Testmode implementieren.
5. Erst danach kontrollierten Gate-Test in Dev-Shop durchführen.
6. Billing API nur als Phase 2 starten, falls Managed Pricing für Usage/Enterprise nicht reicht.

## 9. Was NICHT geändert wurde

- Kein Production Deploy.
- Keine echten Shopify Charges.
- Keine `appSubscriptionCreate`-Mutation.
- Kein `confirmationUrl`-Redirect.
- Keine Partner-Dashboard-Änderung.
- Keine Secrets eingetragen oder ausgegeben.
- Keine Runtime-Codeänderung an OAuth, Webhooks, Product Sync, GDPR oder Embedded App.
- Keine Änderungen an `efro`, `efro-agent`, `efro-widget` oder `efro-brain`.

## Entscheidung

Empfohlen: Shopify Managed Pricing zuerst, mit minimalem Status-Gate und Sync zu `efro`. Shopify Billing API bleibt spätere Option für Usage Charges, komplexe Planwechsel oder falls Managed Pricing die EFRO-Kommerzlogik nicht ausreichend abbildet.
