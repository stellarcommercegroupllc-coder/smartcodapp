import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// GET /apps/cod/cod-bundles?productId=gid://shopify/Product/123
// Returns active bundle offers that apply to this product (specific match
// or "all"), sorted by minQuantity so the storefront can render tiers.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const productId = url.searchParams.get("productId") || "";

  const settings = await prisma.shopSettings.findUnique({
    where: { shop: session.shop },
  });
  if (!settings || !settings.isActive) {
    return json({ offers: [] });
  }

  const offers = await prisma.bundleOffer.findMany({
    where: {
      shopSettingsId: settings.id,
      isActive: true,
      OR: [{ productId }, { productId: "all" }],
    },
    orderBy: { minQuantity: "asc" },
    select: {
      id: true,
      title: true,
      minQuantity: true,
      discountType: true,
      discountValue: true,
    },
  });

  // If both a product-specific and an "all" offer exist for the same
  // minQuantity, prefer the product-specific one.
  const byQuantity = new Map<number, (typeof offers)[number]>();
  for (const offer of offers) {
    const existing = byQuantity.get(offer.minQuantity);
    if (!existing) {
      byQuantity.set(offer.minQuantity, offer);
    }
  }

  return json({ offers: Array.from(byQuantity.values()) });
};
