(function () {
  const root = document.getElementById("smart-cod-form-root");
  if (!root) return;

  const form = document.getElementById("smart-cod-form");
  const messageEl = document.getElementById("rc-message");
  const subtotalEl = document.getElementById("rc-subtotal");
  const totalEl = document.getElementById("rc-total");
  const savingsRow = document.getElementById("rc-savings-row");
  const savingsEl = document.getElementById("rc-savings");
  const otpSection = document.getElementById("rc-otp-section");
  const tiersContainer = document.getElementById("rc-bundle-offers");
  const proxyUrl = root.dataset.appProxyUrl || "/apps/cod";

  const productId = root.dataset.productId
    ? `gid://shopify/Product/${root.dataset.productId}`
    : "";
  const variantGid = `gid://shopify/ProductVariant/${root.dataset.variantId}`;
  const basePrice = parseFloat(root.dataset.price || "0") / 100; // Liquid `.price` is in cents

  let quantity = 1;
  let offers = []; // [{id, title, minQuantity, discountType, discountValue}]
  let submissionId = null;

  // --- Fetch active bundle offers for this product ---
  async function loadOffers() {
    try {
      const res = await fetch(
        `${proxyUrl}/cod-bundles?productId=${encodeURIComponent(productId)}`,
      );
      const data = await res.json();
      offers = data.offers || [];
      renderTiers();
      computeTotals();
    } catch (err) {
      // Fail silently — form still works without bundle tiers
    }
  }

  // --- Render selectable quantity tiers, e.g. 1 / 2 (Save 10%) / 3 (Save 15%) ---
  function renderTiers() {
    if (!tiersContainer) return;
    if (offers.length === 0) {
      tiersContainer.innerHTML = "";
      return;
    }

    const tierQuantities = Array.from(
      new Set([1, ...offers.map((o) => o.minQuantity)]),
    ).sort((a, b) => a - b);

    tiersContainer.innerHTML = `
      <div class="rc-tiers">
        ${tierQuantities
          .map((qty) => {
            const offer = bestOfferForQuantity(qty);
            const label =
              qty === 1
                ? "Single"
                : offer
                  ? `${qty} — ${offer.title}`
                  : `${qty}`;
            return `
              <button type="button" class="rc-tier" data-qty="${qty}">
                ${label}
              </button>
            `;
          })
          .join("")}
      </div>
    `;

    tiersContainer.querySelectorAll(".rc-tier").forEach((btn) => {
      btn.addEventListener("click", () => {
        quantity = parseInt(btn.getAttribute("data-qty"), 10);
        tiersContainer
          .querySelectorAll(".rc-tier")
          .forEach((b) => b.classList.remove("rc-tier--active"));
        btn.classList.add("rc-tier--active");
        computeTotals();
      });
    });

    // default-select the first tier
    tiersContainer.querySelector(".rc-tier")?.classList.add("rc-tier--active");
  }

  // Mirrors the server's "highest qualifying minQuantity wins" rule, so the
  // number shown to the customer matches what they'll actually be charged.
  function bestOfferForQuantity(qty) {
    const eligible = offers
      .filter((o) => qty >= o.minQuantity)
      .sort((a, b) => b.minQuantity - a.minQuantity);
    return eligible[0] || null;
  }

  // --- Client-side estimate only. The server independently recomputes this
  // from real prices before creating the order — this is purely UX. ---
  function computeTotals() {
    const rawSubtotal = basePrice * quantity;
    const offer = bestOfferForQuantity(quantity);

    let discount = 0;
    if (offer) {
      discount =
        offer.discountType === "percentage"
          ? rawSubtotal * (offer.discountValue / 100)
          : Math.min(offer.discountValue, rawSubtotal);
    }

    const estimatedTotal = rawSubtotal - discount;

    subtotalEl.textContent = `$${rawSubtotal.toFixed(2)}`;
    totalEl.textContent = `$${estimatedTotal.toFixed(2)} (est., excl. any COD fee)`;

    if (discount > 0 && savingsRow && savingsEl) {
      savingsEl.textContent = `-$${discount.toFixed(2)} (${offer.title})`;
      savingsRow.style.display = "flex";
    } else if (savingsRow) {
      savingsRow.style.display = "none";
    }
  }

  loadOffers();

  function getUtmParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      utmSource: params.get("utm_source") || undefined,
      utmMedium: params.get("utm_medium") || undefined,
      utmCampaign: params.get("utm_campaign") || undefined,
    };
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    messageEl.textContent = "Submitting...";

    const formData = new FormData(form);
    const payload = {
      customerName: `${formData.get("firstName") || ""} ${formData.get("lastName") || ""}`.trim() || formData.get("customerName"),
      phone: formData.get("phone"),
      email: formData.get("email") || undefined,
      address1: formData.get("address1"),
      city: formData.get("city"),
      zip: formData.get("zip"),
      country: formData.get("country"),
      cart: [{ variantId: variantGid, quantity }],
      ...getUtmParams(),
    };

    try {
      const res = await fetch(`${proxyUrl}/cod-submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.error) {
        messageEl.textContent = data.error;
        return;
      }

      submissionId = data.submissionId;

      // Server-confirmed pricing replaces our estimate
      subtotalEl.textContent = `$${data.subtotal.toFixed(2)}`;
      totalEl.textContent = `$${data.total.toFixed(2)}`;
      if (data.discountAmount > 0 && savingsRow && savingsEl) {
        savingsEl.textContent = `-$${data.discountAmount.toFixed(2)}${
          data.bundleApplied ? ` (${data.bundleApplied.title})` : ""
        }`;
        savingsRow.style.display = "flex";
      }

      if (data.otpRequired) {
        otpSection.style.display = "block";
        messageEl.textContent = "Enter the verification code we texted you.";
      } else {
        messageEl.textContent =
          "Order placed! We'll contact you to confirm delivery.";
        form.reset();
      }
    } catch (err) {
      messageEl.textContent = "Something went wrong. Please try again.";
    }
  });

  const verifyBtn = document.getElementById("rc-verify-otp-btn");
  verifyBtn?.addEventListener("click", async function () {
    const code = form.querySelector('[name="otpCode"]').value;
    const res = await fetch(`${proxyUrl}/cod-verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId, code }),
    });
    const data = await res.json();
    if (data.error) {
      messageEl.textContent = data.error;
      return;
    }
    messageEl.textContent = "Order confirmed! We'll contact you to arrange delivery.";
    otpSection.style.display = "none";
    form.reset();
  });
})();
