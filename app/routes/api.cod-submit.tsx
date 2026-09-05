import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// This route is exposed to the storefront via Shopify's App Proxy
// (configure app proxy in shopify.app.toml or Partner Dashboard, e.g.
// prefix "apps", subpath "cod" -> mapped to /api/cod-submit).
// authenticate.public.appProxy verifies the request signature, so we know
// it genuinely came from the merchant's storefront.
//
// IMPORTANT: we never trust prices or discounts sent by the client. The
// client only tells us which variants + quantities are in the cart; we
// look up real prices and the applicable bundle discount ourselves.

type CartInput = { variantId: string; quantity: number };

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.public.appProxy(request);

  if (!session || !admin) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    customerName,
    phone,
    email,
    address1,
    address2,
    city,
    province,
    zip,
    country,
    cart,
    utmSource,
    utmMedium,
    utmCampaign,
  }: {
    customerName: string;
    phone: string;
    email?: string;
    address1: string;
    address2?: string;
    city: string;
    province?: string;
    zip?: string;
    country: string;
    cart: CartInput[];
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
  } = body;

  if (!customerName || !phone || !address1 || !city || !country || !cart?.length) {
    return json({ error: "Missing required fields" }, { status: 400 });
  }

  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null;

  const settings = await prisma.shopSettings.upsert({
    where: { shop: session.shop },
    update: {},
    create: { shop: session.shop },
  });

  if (!settings.isActive || settings.formVisibility === "disabled") {
    return json({ error: "COD form is currently disabled" }, { status: 403 });
  }

  // --- Visibility: country / order-value gates (checked again below once
  // we know the real subtotal) ---
  if (settings.allowedCountries) {
    const allowed = settings.allowedCountries.split(",").map((c) => c.trim());
    if (!allowed.includes(country)) {
      return json(
        { error: "Cash on delivery isn't available in your country" },
        { status: 403 },
      );
    }
  }

  // --- Fraud Prevention: User Blocking ---
  const isIpAllowlisted =
    !!ipAddress &&
    !!settings.allowedIps &&
    settings.allowedIps.split(",").map((i) => i.trim()).includes(ipAddress);

  if (!isIpAllowlisted) {
    const blockedPhones = settings.blockedPhoneNumbers
      ? settings.blockedPhoneNumbers.split(",").map((p) => p.trim())
      : [];
    const blockedEmails = settings.blockedEmails
      ? settings.blockedEmails.split(",").map((e) => e.trim().toLowerCase())
      : [];
    const blockedIps = settings.blockedIps
      ? settings.blockedIps.split(",").map((i) => i.trim())
      : [];

    const isBlocked =
      blockedPhones.includes(phone.trim()) ||
      (!!email && blockedEmails.includes(email.trim().toLowerCase())) ||
      (!!ipAddress && blockedIps.includes(ipAddress));

    if (isBlocked) {
      return json({ error: settings.blockedOrderMessage }, { status: 403 });
    }
  }

  if (settings.postalCodeMode !== "none" && settings.postalCodes && zip) {
    const codes = settings.postalCodes.split(",").map((c) => c.trim());
    const isListed = codes.includes(zip.trim());
    const violates =
      (settings.postalCodeMode === "exclude" && isListed) ||
      (settings.postalCodeMode === "allow_only" && !isListed);
    if (violates) {
      return json({ error: settings.blockedOrderMessage }, { status: 403 });
    }
  }

  if (settings.maxQtyBlockEnabled) {
    const totalQty = cart.reduce((sum, i) => sum + i.quantity, 0);
    if (totalQty > settings.maxQtyBlockValue) {
      return json({ error: settings.blockedOrderMessage }, { status: 403 });
    }
  }

  if (settings.rateLimitEnabled && !isIpAllowlisted) {
    const since = new Date(Date.now() - settings.rateLimitHours * 60 * 60 * 1000);
    const recent = await prisma.codSubmission.findFirst({
      where: {
        shopSettingsId: settings.id,
        createdAt: { gte: since },
        status: { notIn: ["failed", "blocked"] },
        OR: [
          { phone: phone.trim() },
          ...(email ? [{ email: email.trim() }] : []),
          ...(ipAddress ? [{ ipAddress }] : []),
        ],
      },
    });
    if (recent) {
      return json({ error: settings.blockedOrderMessage }, { status: 429 });
    }
  }

  // 1. Look up real, current prices for every variant (never trust the client)
  const priced = await fetchVariantPrices(admin, cart);
  if (priced.error) {
    return json({ error: priced.error }, { status: 400 });
  }
  const lineItems = priced.lineItems!;

  const rawSubtotal = lineItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const totalQuantity = lineItems.reduce((sum, item) => sum + item.quantity, 0);

  // 2. Find the best-matching bundle offer server-side and recompute discount
  const bundle = await findBestBundleOffer(
    settings.id,
    lineItems,
    totalQuantity,
  );

  let discountAmount = 0;
  if (bundle) {
    discountAmount =
      bundle.discountType === "percentage"
        ? rawSubtotal * (bundle.discountValue / 100)
        : Math.min(bundle.discountValue, rawSubtotal);
  }

  const subtotal = rawSubtotal - discountAmount;

  if (settings.minOrderValue && subtotal < settings.minOrderValue) {
    return json(
      { error: `Minimum order value is ${settings.minOrderValue}` },
      { status: 400 },
    );
  }
  if (settings.maxOrderValue && subtotal > settings.maxOrderValue) {
    return json(
      { error: `Maximum order value is ${settings.maxOrderValue}` },
      { status: 400 },
    );
  }

  // 3. Recompute COD fee and tax server-side, off the discounted subtotal
  let codFee = 0;
  if (settings.codFeeEnabled) {
    codFee =
      settings.codFeeType === "percentage"
        ? subtotal * (settings.codFeeAmount / 100)
        : settings.codFeeAmount;
  }

  let taxAmount = 0;
  if (settings.taxEnabled && !settings.taxIncludedInPrice) {
    taxAmount = subtotal * (settings.taxRate / 100);
  }

  const total = subtotal + codFee + taxAmount;

  // 4. Record the submission (source of truth even if order creation fails)
  const submission = await prisma.codSubmission.create({
    data: {
      shopSettingsId: settings.id,
      customerName,
      phone,
      email,
      address1,
      address2,
      city,
      province,
      zip,
      country,
      ipAddress,
      utmSource: settings.saveUtmParams ? utmSource : null,
      utmMedium: settings.saveUtmParams ? utmMedium : null,
      utmCampaign: settings.saveUtmParams ? utmCampaign : null,
      cartSnapshot: JSON.stringify(lineItems),
      bundleApplied: bundle?.id ?? null,
      subtotal,
      codFee,
      taxAmount,
      total,
      status: settings.requirePhoneOtp ? "pending" : "verified",
    },
  });

  // 5. If OTP isn't required, create the order right away
  if (!settings.requirePhoneOtp) {
    const orderId = await createOrder(
      admin,
      submission,
      lineItems,
      discountAmount,
      settings.saveOrdersAsDraft,
      settings.addAppTag,
    );
    await prisma.codSubmission.update({
      where: { id: submission.id },
      data: { status: "converted", shopifyOrderId: orderId },
    });
    return json({
      ok: true,
      submissionId: submission.id,
      orderId,
      subtotal: rawSubtotal,
      discountAmount,
      codFee,
      total,
      bundleApplied: bundle ? { title: bundle.title } : null,
    });
  }

  // Otherwise the storefront should now call /api/cod-verify-otp with the code
  return json({
    ok: true,
    submissionId: submission.id,
    otpRequired: true,
    subtotal: rawSubtotal,
    discountAmount,
    codFee,
    total,
    bundleApplied: bundle ? { title: bundle.title } : null,
  });
};

// --- Look up authoritative variant prices via Admin GraphQL ---
async function fetchVariantPrices(admin: any, cart: CartInput[]) {
  if (!cart.every((i) => i.variantId && i.quantity > 0)) {
    return { error: "Invalid cart" };
  }

  const query = `#graphql
    query getVariantPrices($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProductVariant {
          id
          price
          title
          product { title }
        }
      }
    }
  `;

  const response = await admin.graphql(query, {
    variables: { ids: cart.map((i) => i.variantId) },
  });
  const data = await response.json();
  const nodes = data?.data?.nodes ?? [];

  const lineItems = cart.map((item, idx) => {
    const node = nodes[idx];
    if (!node) throw new Error(`Variant not found: ${item.variantId}`);
    return {
      variantId: item.variantId,
      quantity: item.quantity,
      price: parseFloat(node.price),
      title: `${node.product?.title ?? ""} - ${node.title ?? ""}`.trim(),
    };
  });

  if (lineItems.some((li) => !li.price && li.price !== 0)) {
    return { error: "One or more products could not be found" };
  }

  return { lineItems };
}

// --- Pick the highest minQuantity offer the cart actually qualifies for ---
async function findBestBundleOffer(
  shopSettingsId: string,
  lineItems: { variantId: string; quantity: number }[],
  totalQuantity: number,
) {
  const offers = await prisma.bundleOffer.findMany({
    where: { shopSettingsId, isActive: true },
    orderBy: { minQuantity: "desc" },
  });

  for (const offer of offers) {
    if (offer.productId === "all") {
      if (totalQuantity >= offer.minQuantity) return offer;
      continue;
    }
    const matchingQty = lineItems
      .filter((li) => li.variantId === offer.productId)
      .reduce((sum, li) => sum + li.quantity, 0);
    if (matchingQty >= offer.minQuantity) return offer;
  }

  return null;
}

export async function createOrder(
  admin: any,
  submission: any,
  lineItems: { variantId: string; quantity: number }[],
  discountAmount: number,
  asDraft: boolean,
  addAppTag: boolean,
) {
  const tags = addAppTag ? ["COD"] : [];
  const shippingAddress = {
    firstName: submission.customerName.split(" ")[0],
    lastName: submission.customerName.split(" ").slice(1).join(" ") || "-",
    phone: submission.phone,
    address1: submission.address1,
    address2: submission.address2 || undefined,
    city: submission.city,
    province: submission.province || undefined,
    zip: submission.zip || undefined,
    country: submission.country,
  };

  if (asDraft) {
    return createDraftOrder(admin, lineItems, tags, shippingAddress, submission, discountAmount);
  }
  return createRealOrder(admin, lineItems, tags, shippingAddress, submission, discountAmount);
}

async function createDraftOrder(
  admin: any,
  lineItems: { variantId: string; quantity: number }[],
  tags: string[],
  shippingAddress: any,
  submission: any,
  discountAmount: number,
) {
  const mutation = `#graphql
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id }
        userErrors { field message }
      }
    }
  `;

  const input: any = {
    lineItems: lineItems.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
    })),
    note: `Cash on Delivery order via COD Form app${
      submission.codFee ? ` (COD fee: ${submission.codFee})` : ""
    }`,
    tags,
    shippingAddress,
  };

  if (discountAmount > 0) {
    input.appliedDiscount = {
      description: "Bundle / quantity offer",
      valueType: "FIXED_AMOUNT",
      value: discountAmount.toFixed(2),
    };
  }

  const response = await admin.graphql(mutation, { variables: { input } });
  const data = await response.json();
  const draftOrder = data?.data?.draftOrderCreate?.draftOrder;
  const errors = data?.data?.draftOrderCreate?.userErrors;

  if (errors?.length) {
    throw new Error(errors.map((e: any) => e.message).join(", "));
  }

  return draftOrder?.id ?? null;
}

// NOTE: `orderCreate` (as opposed to `draftOrderCreate`) creates a real,
// immediately-active order rather than a draft a staff member has to open
// and complete manually. This is the "Create orders with the Cash on
// Delivery (COD) payment method" option from Settings > General. The exact
// input shape is more restrictive than DraftOrderInput and has shifted
// across API versions — verify field names against the API version pinned
// in shopify.server.ts (2024-10) before relying on this in production; it's
// included here to show the branch point, not fully hardened.
async function createRealOrder(
  admin: any,
  lineItems: { variantId: string; quantity: number }[],
  tags: string[],
  shippingAddress: any,
  submission: any,
  discountAmount: number,
) {
  const mutation = `#graphql
    mutation orderCreate($order: OrderCreateOrderInput!) {
      orderCreate(order: $order) {
        order { id }
        userErrors { field message }
      }
    }
  `;

  const input: any = {
    lineItems: lineItems.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
    })),
    tags,
    shippingAddress,
    financialStatus: "PENDING", // COD orders are unpaid until delivery
    note: `Cash on Delivery order via COD Form app${
      submission.codFee ? ` (COD fee: ${submission.codFee})` : ""
    }`,
  };

  const response = await admin.graphql(mutation, { variables: { order: input } });
  const data = await response.json();
  const order = data?.data?.orderCreate?.order;
  const errors = data?.data?.orderCreate?.userErrors;

  if (errors?.length) {
    throw new Error(errors.map((e: any) => e.message).join(", "));
  }

  return order?.id ?? null;
}
