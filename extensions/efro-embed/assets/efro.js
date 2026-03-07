(function () {
  const BRAIN_URL = 'https://app.avatarsalespro.com';
  const params = new URLSearchParams(window.location.search);
  const SHOP = params.get('shop') || window.location.hostname;

  if (!SHOP) {
    console.warn('EFRO: shop domain not detected, widget not loaded');
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.src = BRAIN_URL + '/widget/?shop=' + encodeURIComponent(SHOP);
  iframe.style.position = "fixed";
  iframe.style.bottom = "20px";
  iframe.style.right = "20px";
  iframe.style.width = "380px";
  iframe.style.height = "620px";
  iframe.style.border = "none";
  iframe.style.zIndex = "999999";
  iframe.allow = "microphone";

  document.body.appendChild(iframe);
})();
