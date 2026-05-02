/**
 * Legacy Shopify template module disabled.
 *
 * Active EFRO Shopify runtime is server.js.
 * This placeholder intentionally avoids SQLite session storage and old REST Admin API resources.
 */

const shopify = {
  api: {
    clients: {
      Graphql: class DisabledLegacyGraphqlClient {
        constructor() {
          throw new Error("Legacy Shopify template module disabled. Use server.js runtime.");
        }
      },
    },
  },
};

export default shopify;
