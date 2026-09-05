import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  // If this order originated from our COD form (tagged "COD"), reconcile it.
  const tags: string[] = payload.tags
    ? String(payload.tags).split(",").map((t: string) => t.trim())
    : [];

  if (tags.includes("COD")) {
    const settings = await prisma.shopSettings.findUnique({ where: { shop } });
    if (settings) {
      await prisma.codSubmission.updateMany({
        where: {
          shopSettingsId: settings.id,
          phone: payload.phone ?? undefined,
          status: { not: "converted" },
        },
        data: { status: "converted", shopifyOrderId: String(payload.admin_graphql_api_id) },
      });
    }
  }

  return new Response();
};
