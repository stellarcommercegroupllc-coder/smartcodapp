import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page,
  Card,
  FormLayout,
  TextField,
  Checkbox,
  Select,
  BlockStack,
  Text,
  IndexTable,
  Badge,
  Button,
  EmptyState,
  Tabs,
  Banner,
  InlineStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.shopSettings.upsert({
    where: { shop: session.shop },
    update: {},
    create: { shop: session.shop },
  });
  const queue = await prisma.codSubmission.findMany({
    where: {
      shopSettingsId: settings.id,
      status: { in: ["converted", "out_for_delivery"] },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  return json({ settings, queue });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "save-address-validation") {
    await prisma.shopSettings.update({
      where: { shop: session.shop },
      data: {
        addressAutocompleteEnabled: form.get("addressAutocompleteEnabled") === "true",
      },
    });
  } else if (intent === "save-sms") {
    await prisma.shopSettings.update({
      where: { shop: session.shop },
      data: {
        messagingChannel: String(form.get("messagingChannel") || "sms"),
        orderConfirmationSmsEnabled: form.get("orderConfirmationSmsEnabled") === "true",
        orderConfirmationSmsText: String(form.get("orderConfirmationSmsText") || ""),
        shippingConfirmationSmsEnabled: form.get("shippingConfirmationSmsEnabled") === "true",
        shippingConfirmationSmsText: String(form.get("shippingConfirmationSmsText") || ""),
        outForDeliverySmsEnabled: form.get("outForDeliverySmsEnabled") === "true",
        outForDeliverySmsText: String(form.get("outForDeliverySmsText") || ""),
        deliveryReminderDays: Number(form.get("deliveryReminderDays") || 3),
      },
    });
  } else if (intent === "mark-status") {
    await prisma.codSubmission.update({
      where: { id: String(form.get("id")) },
      data: { status: String(form.get("status")) },
    });
  }

  return json({ ok: true });
};

export default function DeliverySuccess() {
  const { settings, queue } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [tab, setTab] = useState(0);

  const tabs = [
    { id: "address", content: "Address Validation" },
    { id: "sms", content: "SMS/WhatsApp" },
  ];

  const markStatus = (id: string, status: string) => {
    const data = new FormData();
    data.set("intent", "mark-status");
    data.set("id", id);
    data.set("status", status);
    submit(data, { method: "post" });
  };

  return (
    <Page title="Delivery Success">
      <BlockStack gap="400">
        <Tabs tabs={tabs} selected={tab} onSelect={setTab} />
        {tab === 0 && <AddressValidationTab settings={settings} submit={submit} />}
        {tab === 1 && <SmsTab settings={settings} submit={submit} />}

        <Card padding="0">
          <Box padding="300">
            <Text as="h2" variant="headingMd">
              Orders awaiting delivery confirmation
            </Text>
          </Box>
          {queue.length === 0 ? (
            <EmptyState
              heading="No orders awaiting delivery confirmation"
              image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
            >
              <p>
                COD orders that have been placed but not yet marked delivered
                or returned will show up here.
              </p>
            </EmptyState>
          ) : (
            <IndexTable
              resourceName={{ singular: "order", plural: "orders" }}
              itemCount={queue.length}
              headings={[
                { title: "Customer" },
                { title: "Phone" },
                { title: "Total" },
                { title: "Status" },
                { title: "Placed" },
                { title: "Actions" },
              ]}
              selectable={false}
            >
              {queue.map((s, index) => (
                <IndexTable.Row id={s.id} key={s.id} position={index}>
                  <IndexTable.Cell>{s.customerName}</IndexTable.Cell>
                  <IndexTable.Cell>{s.phone}</IndexTable.Cell>
                  <IndexTable.Cell>${s.total.toFixed(2)}</IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={s.status === "delivered" ? "success" : s.status === "returned" ? "critical" : "warning"}>
                      {s.status}
                    </Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{new Date(s.createdAt).toLocaleDateString()}</IndexTable.Cell>
                  <IndexTable.Cell>
                    <Button size="slim" onClick={() => markStatus(s.id, "out_for_delivery")}>Out for delivery</Button>{" "}
                    <Button size="slim" onClick={() => markStatus(s.id, "delivered")}>Delivered</Button>{" "}
                    <Button size="slim" tone="critical" onClick={() => markStatus(s.id, "returned")}>Returned</Button>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}

function Box({ padding, children }: { padding: string; children: React.ReactNode }) {
  return <div style={{ padding: `${parseInt(padding) || 12}px` }}>{children}</div>;
}

function AddressValidationTab({ settings, submit }: any) {
  const [enabled, setEnabled] = useState(settings.addressAutocompleteEnabled);

  const handleSave = useCallback(() => {
    const data = new FormData();
    data.set("intent", "save-address-validation");
    data.set("addressAutocompleteEnabled", String(enabled));
    submit(data, { method: "post" });
  }, [enabled, submit]);

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="300">
          <InlineStack align="space-between">
            <Text as="h2" variant="headingMd">Google Autocomplete balance</Text>
            <Text as="span" variant="headingLg">${settings.addressValidationBalance.toFixed(2)}</Text>
          </InlineStack>
          <Text as="p" tone="subdued">
            Autocompletes the shipping address as the customer types,
            reducing address errors and failed deliveries. Requires a Google
            Places API key wired into the storefront JS — the toggle and
            billing balance here are real, the actual autocomplete call
            against Google's API is not implemented in this scaffold.
          </Text>
          <Checkbox
            label="Enable Google Autocomplete on your COD form"
            checked={enabled}
            onChange={setEnabled}
          />
          <div>
            <Button variant="primary" onClick={handleSave}>Save</Button>
          </div>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

function SmsTab({ settings, submit }: any) {
  const [messagingChannel, setMessagingChannel] = useState(settings.messagingChannel);
  const [orderConfirmationSmsEnabled, setOrderConfirmationSmsEnabled] = useState(settings.orderConfirmationSmsEnabled);
  const [orderConfirmationSmsText, setOrderConfirmationSmsText] = useState(settings.orderConfirmationSmsText);
  const [shippingConfirmationSmsEnabled, setShippingConfirmationSmsEnabled] = useState(settings.shippingConfirmationSmsEnabled);
  const [shippingConfirmationSmsText, setShippingConfirmationSmsText] = useState(settings.shippingConfirmationSmsText);
  const [outForDeliverySmsEnabled, setOutForDeliverySmsEnabled] = useState(settings.outForDeliverySmsEnabled);
  const [outForDeliverySmsText, setOutForDeliverySmsText] = useState(settings.outForDeliverySmsText);
  const [deliveryReminderDays, setDeliveryReminderDays] = useState(String(settings.deliveryReminderDays));

  const handleSave = useCallback(() => {
    const data = new FormData();
    data.set("intent", "save-sms");
    data.set("messagingChannel", messagingChannel);
    data.set("orderConfirmationSmsEnabled", String(orderConfirmationSmsEnabled));
    data.set("orderConfirmationSmsText", orderConfirmationSmsText);
    data.set("shippingConfirmationSmsEnabled", String(shippingConfirmationSmsEnabled));
    data.set("shippingConfirmationSmsText", shippingConfirmationSmsText);
    data.set("outForDeliverySmsEnabled", String(outForDeliverySmsEnabled));
    data.set("outForDeliverySmsText", outForDeliverySmsText);
    data.set("deliveryReminderDays", deliveryReminderDays);
    submit(data, { method: "post" });
  }, [messagingChannel, orderConfirmationSmsEnabled, orderConfirmationSmsText, shippingConfirmationSmsEnabled, shippingConfirmationSmsText, outForDeliverySmsEnabled, outForDeliverySmsText, deliveryReminderDays, submit]);

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="300">
          <InlineStack align="space-between">
            <Text as="h2" variant="headingMd">SMS/WhatsApp credits</Text>
            <Text as="span" variant="headingLg">${settings.smsCreditsBalance.toFixed(2)}</Text>
          </InlineStack>
          <Select
            label="Channel"
            options={[{ label: "SMS", value: "sms" }, { label: "WhatsApp", value: "whatsapp" }]}
            value={messagingChannel}
            onChange={setMessagingChannel}
          />
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Automations</Text>
          <FormLayout>
            <Checkbox label="Order confirmation message" checked={orderConfirmationSmsEnabled} onChange={setOrderConfirmationSmsEnabled} />
            <TextField label="Message text" value={orderConfirmationSmsText} onChange={setOrderConfirmationSmsText} autoComplete="off" disabled={!orderConfirmationSmsEnabled} helpText="Variables: {{customer_name}}, {{order_number}}" />

            <Checkbox label="Shipping confirmation message" checked={shippingConfirmationSmsEnabled} onChange={setShippingConfirmationSmsEnabled} />
            <TextField label="Message text" value={shippingConfirmationSmsText} onChange={setShippingConfirmationSmsText} autoComplete="off" disabled={!shippingConfirmationSmsEnabled} />

            <Checkbox label="Out for delivery message" checked={outForDeliverySmsEnabled} onChange={setOutForDeliverySmsEnabled} helpText="Reduces refused-at-the-door returns (RTO)" />
            <TextField label="Message text" value={outForDeliverySmsText} onChange={setOutForDeliverySmsText} autoComplete="off" disabled={!outForDeliverySmsEnabled} />

            <TextField label="Send a reminder this many days after order creation if still unconfirmed" type="number" value={deliveryReminderDays} onChange={setDeliveryReminderDays} autoComplete="off" />
          </FormLayout>
          <Banner tone="info">
            These toggles and message templates are real and persisted.
            Actually sending anything requires a scheduled job that queries
            due submissions and calls your SMS provider (configured under
            Settings &amp; Integrations) — not wired up in this scaffold.
          </Banner>
          <div>
            <Button variant="primary" onClick={handleSave}>Save</Button>
          </div>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
