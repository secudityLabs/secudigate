/* Secudigate embed script.
 *
 * Usage:
 *   <script async src="https://your-secudigate.app/embed.js"></script>
 *   <button data-secudigate-invoice="<invoice-id>">Pay with Secudigate</button>
 *   <button data-secudigate-deposit="<slug>">Fund my account</button>
 *
 * Optional attributes on the button:
 *   data-color="#hex"   → override the brand color
 *   data-label="..."    → override the default text
 */
(function () {
  "use strict";

  var script = document.currentScript || (function () {
    var s = document.getElementsByTagName("script");
    return s[s.length - 1];
  })();

  var base = (script && script.dataset && script.dataset.base) ||
    (script && script.src ? new URL(script.src).origin : window.location.origin);

  function styleAsButton(el, color) {
    var bg = el.dataset.color || color || "#7c5cff";
    el.style.display          = "inline-flex";
    el.style.alignItems       = "center";
    el.style.justifyContent   = "center";
    el.style.gap              = "8px";
    el.style.padding          = "10px 18px";
    el.style.borderRadius     = "12px";
    el.style.background       = bg;
    el.style.color            = "#ffffff";
    el.style.fontFamily       = "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    el.style.fontSize         = "14px";
    el.style.fontWeight       = "500";
    el.style.lineHeight       = "1";
    el.style.cursor           = "pointer";
    el.style.border           = "none";
    el.style.textDecoration   = "none";
    el.style.transition       = "filter 150ms ease";
    el.addEventListener("mouseenter", function () { el.style.filter = "brightness(1.08)"; });
    el.addEventListener("mouseleave", function () { el.style.filter = "none"; });
  }

  function ensureLabel(el, fallback) {
    if (el.dataset.label) {
      el.textContent = el.dataset.label;
    } else if (!el.textContent || !el.textContent.trim()) {
      el.textContent = fallback;
    }
  }

  function openPopup(url) {
    var w = 480, h = 720;
    var left = window.screenX + (window.outerWidth - w) / 2;
    var top  = window.screenY + (window.outerHeight - h) / 2;
    var win = window.open(url, "secudigate", "width=" + w + ",height=" + h + ",left=" + left + ",top=" + top);
    if (!win) {
      // Popup blocked — fall back to a full navigation in a new tab.
      window.open(url, "_blank", "noopener");
    }
  }

  function init() {
    var invoiceButtons = document.querySelectorAll("[data-secudigate-invoice]");
    invoiceButtons.forEach(function (el) {
      if (el.dataset.__secudigateBound) return;
      el.dataset.__secudigateBound = "1";
      var id = el.getAttribute("data-secudigate-invoice");
      if (!id) return;
      ensureLabel(el, "Pay with Secudigate");
      styleAsButton(el);
      el.addEventListener("click", function (e) {
        e.preventDefault();
        openPopup(base + "/pay/" + encodeURIComponent(id));
      });
    });

    var depositButtons = document.querySelectorAll("[data-secudigate-deposit]");
    depositButtons.forEach(function (el) {
      if (el.dataset.__secudigateBound) return;
      el.dataset.__secudigateBound = "1";
      var slug = el.getAttribute("data-secudigate-deposit");
      if (!slug) return;
      ensureLabel(el, "Deposit with Secudigate");
      styleAsButton(el);
      el.addEventListener("click", function (e) {
        e.preventDefault();
        openPopup(base + "/deposit/" + encodeURIComponent(slug));
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Re-scan when DOM mutates so SPAs that add buttons after load work.
  if (window.MutationObserver) {
    new MutationObserver(init).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
