import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { createOrder } from "./api.cod-submit";

// NOTE: sending the actual SMS is out of scope here — plug in Twilio, MSG91,
// or a similar SMS provider in a `sendOtp` step when the submission is
// created (see api.cod-submit.tsx), and store the generated code on
// `otpCode`. This route just checks the code the customer typed against
// what we stored, then — on success — creates the order, same as the
// non-OTP path in api.cod-submit.tsx.

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.public.appProxy(request);
  if (!session || !admin) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const { submissionId, code } = await request.json();

  const submission = await prisma.codSubmission.findUnique({
    where: { id: submissionId },
  });

  if (!submission) {
    return json({ error: "Submission not found" }, { status: 404 });
  }

  if (submission.status === "converted") {
    return json({ ok: true, orderId: submission.shopifyOrderId });
  }

  if (submission.otpCode !== code) {
    return json({ error: "Incorrect code" }, { status: 400 });
  }

  const settings = await prisma.shopSettings.findUnique({
    where: { id: submission.shopSettingsId },
  });
  if (!settings) {
    return json({ error: "Shop settings not found" }, { status: 500 });
  }

  const lineItems = JSON.parse(submission.cartSnapshot) as {
    variantId: string;
    quantity: number;
  }[];

  // The bundle discount amount applied at submit time isn't stored
  // separately on the submission (only the post-discount subtotal is) —
  // add a `discountAmount Float @default(0)` column to CodSubmission and
  // set it in api.cod-submit.tsx if you need the exact figure here for the
  // order's applied-discount line.
  const orderId = await createOrder(
    admin,
    submission,
    lineItems,
    0,
    settings.saveOrdersAsDraft,
    settings.addAppTag,
  );

  await prisma.codSubmission.update({
    where: { id: submission.id },
    data: { otpVerified: true, status: "converted", shopifyOrderId: orderId },
  });

  return json({ ok: true, orderId });
};
