(function () {
  const WIDGET_URL = 'https://widget.avatarsalespro.com/';
  const existing = document.getElementById('efro-avatar-iframe');

  if (existing) {
    return;
  }

  const root =
    document.getElementById('efro-avatar-root') ||
    document.getElementById('efro-avatar-block');

  const params = new URLSearchParams(window.location.search);
  const shopFromRoot = root && root.dataset ? root.dataset.efroShop : '';
  const shopFromQuery = params.get('shop') || '';
  const shopFromShopify = window.Shopify && window.Shopify.shop ? window.Shopify.shop : '';
  const shopFromHost = window.location.hostname || '';

  const shop = shopFromRoot || shopFromQuery || shopFromShopify || shopFromHost;

  if (!shop) {
    if (root) {
      root.innerHTML = '<div style="padding:12px;border:1px solid #d9d9d9;border-radius:10px;">EFRO Sales Assistant: shop context missing.</div>';
    }
    console.warn('EFRO: shop domain not detected, widget not loaded');
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'efro-avatar-iframe';
  iframe.title = 'EFRO Sales Assistant';
  iframe.src = WIDGET_URL + '?shop=' + encodeURIComponent(shop);
  iframe.style.position = 'fixed';
  iframe.style.bottom = '20px';
  iframe.style.right = '20px';
  iframe.style.width = '380px';
  iframe.style.height = '620px';
  iframe.style.border = 'none';
  iframe.style.borderRadius = '16px';
  iframe.style.boxShadow = '0 18px 45px rgba(15, 23, 42, 0.25)';
  iframe.style.zIndex = '999999';
  iframe.allow = 'microphone';

  if (root) {
    root.setAttribute('data-efro-loaded', 'true');
  }

  document.body.appendChild(iframe);
})();
