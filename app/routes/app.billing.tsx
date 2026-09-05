import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  Button,
  InlineGrid,
  Badge,
  ButtonGroup,
  TextField,
  InlineStack,
  Icon,
  Banner,
} from "@shopify/polaris";
import { CheckIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const PLANS = [
  {
    key: "free",
    name: "Forever Free for India",
    annualPrice: 0,
    orderLimit: 100,
    features: [
      "100 Orders/Month",
      "Original Form Design",
      "Basic Fraud Prevention",
      "Address Validation & Cart Recovery",
      "Conversion Boosters & SMS Notifications",
      "Insights & Analytics dashboard",
      "Google Sheets & Ad Pixel",
      "24/7 Email support",
    ],
  },
  {
    key: "premium",
    name: "Premium",
    annualPrice: 89.99,
    orderLimit: 420,
    features: [
      "ALL Free Plan Features",
      "420 Orders/Month",
      "Quantity Offers on Product Page",
      "Advanced Fraud Prevention",
      "Personalized Coverages",
      "24/7 Live Chat Support",
    ],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    annualPrice: 269.99,
    orderLimit: 10000,
    features: [
      "ALL Premium Plan Features",
      "10,000 Orders/Month",
      "Custom Code Assistance",
      "24/7 Live Chat Support (< 5 min response)",
    ],
  },
  {
    key: "unlimited",
    name: "Unlimited",
    annualPrice: 629.99,
    orderLimit: Infinity,
    features: [
      "ALL Enterprise Plan Features",
      "Unlimited Orders/Month",
      "A/B Testing for one-click upsell",
      "Multiple Form Versions",
      "24/7 Live Chat Support (< 2 min response)",
    ],
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.shopSettings.upsert({
    where: { shop: session.shop },
    update: {},
    create: { shop: session.shop },
  });

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const ordersThisMonth = await prisma.codSubmission.count({
    where: {
      shopSettingsId: settings.id,
      status: "converted",
      createdAt: { gte: startOfMonth },
    },
  });

  const totalRevenue = await prisma.codSubmission.aggregate({
    where: { shopSettingsId: settings.id, status: "converted" },
    _sum: { total: true },
  });

  return json({
    currentPlan: settings.planName,
    billingInterval: settings.billingInterval,
    ordersThisMonth,
    totalRevenue: totalRevenue._sum.total ?? 0,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "set-interval") {
    await prisma.shopSettings.update({
      where: { shop: session.shop },
      data: { billingInterval: String(form.get("interval") || "annual") },
    });
    return json({ ok: true });
  }

  const planKey = String(form.get("plan"));
  const plan = PLANS.find((p) => p.key === planKey);
  if (!plan) return json({ error: "Unknown plan" }, { status: 400 });

  if (plan.key === "free") {
    await prisma.shopSettings.update({
      where: { shop: session.shop },
      data: { planName: "free" },
    });
    return json({ ok: true });
  }

  // Redirects the merchant to Shopify's managed pricing confirmation page.
  // NOTE: the `billing` config in shopify.server.ts currently defines
  // monthly plans only — add ANNUAL variants there (see comment in that
  // file) before wiring the annual toggle through to a real charge.
  return billing.request({
    plan: plan.name,
    isTest: process.env.NODE_ENV !== "production",
    returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing`,
  });
};

export default function Billing() {
  const { currentPlan, billingInterval, ordersThisMonth, totalRevenue } =
    useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [interval, setInterval] = useState(billingInterval);
  const [discountCode, setDiscountCode] = useState("");

  const setBillingInterval = (value: string) => {
    setInterval(value);
    const data = new FormData();
    data.set("intent", "set-interval");
    data.set("interval", value);
    submit(data, { method: "post" });
  };

  const choosePlan = (planKey: string) => {
    const data = new FormData();
    data.set("plan", planKey);
    submit(data, { method: "post" });
  };

  const currentPlanData = PLANS.find((p) => p.key === currentPlan) ?? PLANS[0];

  return (
    <Page title="Billing Plans">
      <BlockStack gap="400">
        <Text as="p" tone="subdued">
          Change your plan here. If you need help or have any doubts or
          questions don't hesitate to contact us!
        </Text>

        <InlineStack align="center">
          <ButtonGroup variant="segmented">
            <Button pressed={interval === "monthly"} onClick={() => setBillingInterval("monthly")}>
              Monthly
            </Button>
            <Button pressed={interval === "annual"} onClick={() => setBillingInterval("annual")}>
              Annual <Badge tone="success">-25%</Badge>
            </Button>
          </ButtonGroup>
        </InlineStack>

        <InlineStack align="center">
          <div style={{ maxWidth: 320 }}>
            <TextField
              label="Discount code"
              labelHidden
              value={discountCode}
              onChange={setDiscountCode}
              autoComplete="off"
              placeholder="Enter discount code"
              connectedRight={<Button disabled>Apply</Button>}
            />
          </div>
        </InlineStack>

        <InlineGrid columns={4} gap="400">
          {PLANS.map((plan) => {
            const monthlyEquivalent = plan.annualPrice / 12;
            const monthlyPrice =
              interval === "annual" ? monthlyEquivalent : monthlyEquivalent / 0.75;
            const isCurrent = currentPlan === plan.key;

            return (
              <Card key={plan.key}>
                <BlockStack gap="300">
                  {isCurrent && <Badge tone="success">Your current plan</Badge>}
                  <Text as="h2" variant="headingLg">{plan.name}</Text>
                  {plan.annualPrice === 0 ? (
                    <Text as="p" variant="headingXl">Free</Text>
                  ) : (
                    <BlockStack gap="050">
                      <Text as="p" variant="headingXl">
                        ${(interval === "annual" ? plan.annualPrice : monthlyPrice * 12 / 12).toFixed(2)}
                        <Text as="span" tone="subdued"> /{interval === "annual" ? "year" : "month"}</Text>
                      </Text>
                      {interval === "annual" && (
                        <Text as="span" tone="subdued" variant="bodySm">
                          Equivalent to ${monthlyEquivalent.toFixed(2)}/month, billed annually. Save 25%.
                        </Text>
                      )}
                    </BlockStack>
                  )}
                  <BlockStack gap="150">
                    {plan.features.map((f) => (
                      <InlineStack key={f} gap="150" blockAlign="start" wrap={false}>
                        <Icon source={CheckIcon} tone="success" />
                        <Text as="span" variant="bodySm">{f}</Text>
                      </InlineStack>
                    ))}
                  </BlockStack>
                  {!isCurrent && (
                    <Button
                      variant={plan.annualPrice === 0 ? undefined : "primary"}
                      onClick={() => choosePlan(plan.key)}
                    >
                      {PLANS.findIndex((p) => p.key === plan.key) <
                      PLANS.findIndex((p) => p.key === currentPlan)
                        ? "Downgrade plan"
                        : "Upgrade plan"}
                    </Button>
                  )}
                </BlockStack>
              </Card>
            );
          })}
        </InlineGrid>

        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <Text as="span">
              Orders this month: <b>{ordersThisMonth}</b> /{" "}
              {currentPlanData.orderLimit === Infinity ? "∞" : currentPlanData.orderLimit}
            </Text>
          </InlineStack>
        </Card>

        <Card>
          <Text as="p" alignment="center" fontWeight="semibold">
            Congratulations! You have generated ${totalRevenue.toFixed(2)} of revenue through your COD form!
          </Text>
        </Card>

        <Banner tone="info">
          <p>
            All charges are handled securely via Shopify Billing. Switching
            plans doesn't reset your order count — orders already used this
            month count toward your new plan's limit. You can cancel at any
            time by switching to the free plan or uninstalling the app.
          </p>
        </Banner>
      </BlockStack>
    </Page>
  );
}
