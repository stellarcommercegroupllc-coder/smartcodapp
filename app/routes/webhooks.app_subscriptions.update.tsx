import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const status = payload.app_subscription?.status;
  const name = payload.app_subscription?.name;

  if (status === "ACTIVE" && name) {
    await prisma.shopSettings.updateMany({
      where: { shop },
      data: { planName: name.toLowerCase() },
    });
  } else if (status === "CANCELLED" || status === "EXPIRED") {
    await prisma.shopSettings.updateMany({
      where: { shop },
      data: { planName: "free" },
    });
  }

  return new Response();
};
