import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
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
  return json({ settings });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "save-blocking") {
    await prisma.shopSettings.update({
      where: { shop: session.shop },
      data: {
        rateLimitEnabled: form.get("rateLimitEnabled") === "true",
        rateLimitHours: Number(form.get("rateLimitHours") || 72),
        maxQtyBlockEnabled: form.get("maxQtyBlockEnabled") === "true",
        maxQtyBlockValue: Number(form.get("maxQtyBlockValue") || 10),
        blockedEmails: String(form.get("blockedEmails") || "") || null,
        blockedPhoneNumbers: String(form.get("blockedPhoneNumbers") || "") || null,
        blockedIps: String(form.get("blockedIps") || "") || null,
        allowedIps: String(form.get("allowedIps") || "") || null,
        blockedOrderMessage: String(form.get("blockedOrderMessage") || ""),
        postalCodeMode: String(form.get("postalCodeMode") || "none"),
        postalCodes: String(form.get("postalCodes") || "") || null,
      },
    });
  } else if (intent === "save-verification") {
    await prisma.shopSettings.update({
      where: { shop: session.shop },
      data: {
        requirePhoneOtp: form.get("requirePhoneOtp") === "true",
        otpMessageText: String(form.get("otpMessageText") || ""),
      },
    });
  } else if (intent === "save-partial-payments") {
    await prisma.shopSettings.update({
      where: { shop: session.shop },
      data: { partialPaymentEnabled: form.get("partialPaymentEnabled") === "true" },
    });
  }

  return json({ ok: true });
};

export default function FraudPrevention() {
  const { settings } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";
  const [tab, setTab] = useState(0);

  const tabs = [
    { id: "blocking", content: "User Blocking" },
    { id: "verification", content: "User Verification" },
    { id: "partial", content: "Partial Payments" },
  ];

  return (
    <Page title="Fraud Prevention">
      <BlockStack gap="400">
        <Tabs tabs={tabs} selected={tab} onSelect={setTab} />
        {tab === 0 && <UserBlockingTab settings={settings} submit={submit} isSaving={isSaving} />}
        {tab === 1 && <UserVerificationTab settings={settings} submit={submit} isSaving={isSaving} />}
        {tab === 2 && <PartialPaymentsTab settings={settings} submit={submit} isSaving={isSaving} />}
      </BlockStack>
    </Page>
  );
}

function UserBlockingTab({ settings, submit, isSaving }: any) {
  const [rateLimitEnabled, setRateLimitEnabled] = useState(settings.rateLimitEnabled);
  const [rateLimitHours, setRateLimitHours] = useState(String(settings.rateLimitHours));
  const [maxQtyBlockEnabled, setMaxQtyBlockEnabled] = useState(settings.maxQtyBlockEnabled);
  const [maxQtyBlockValue, setMaxQtyBlockValue] = useState(String(settings.maxQtyBlockValue));
  const [blockedEmails, setBlockedEmails] = useState(settings.blockedEmails ?? "");
  const [blockedPhoneNumbers, setBlockedPhoneNumbers] = useState(settings.blockedPhoneNumbers ?? "");
  const [blockedIps, setBlockedIps] = useState(settings.blockedIps ?? "");
  const [allowedIps, setAllowedIps] = useState(settings.allowedIps ?? "");
  const [blockedOrderMessage, setBlockedOrderMessage] = useState(settings.blockedOrderMessage);
  const [postalCodeMode, setPostalCodeMode] = useState(settings.postalCodeMode);
  const [postalCodes, setPostalCodes] = useState(settings.postalCodes ?? "");

  const handleSave = useCallback(() => {
    const data = new FormData();
    data.set("intent", "save-blocking");
    data.set("rateLimitEnabled", String(rateLimitEnabled));
    data.set("rateLimitHours", rateLimitHours);
    data.set("maxQtyBlockEnabled", String(maxQtyBlockEnabled));
    data.set("maxQtyBlockValue", maxQtyBlockValue);
    data.set("blockedEmails", blockedEmails);
    data.set("blockedPhoneNumbers", blockedPhoneNumbers);
    data.set("blockedIps", blockedIps);
    data.set("allowedIps", allowedIps);
    data.set("blockedOrderMessage", blockedOrderMessage);
    data.set("postalCodeMode", postalCodeMode);
    data.set("postalCodes", postalCodes);
    submit(data, { method: "post" });
  }, [rateLimitEnabled, rateLimitHours, maxQtyBlockEnabled, maxQtyBlockValue, blockedEmails, blockedPhoneNumbers, blockedIps, allowedIps, blockedOrderMessage, postalCodeMode, postalCodes, submit]);

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Rate &amp; quantity limits</Text>
          <FormLayout>
            <Checkbox
              label="Limit orders made from the same customer in X hours"
              checked={rateLimitEnabled}
              onChange={setRateLimitEnabled}
              helpText="Matched by a combination of IP address, email, or phone number"
            />
            <TextField label="Allow only 1 order from the same customer every (hours)" type="number" value={rateLimitHours} onChange={setRateLimitHours} autoComplete="off" disabled={!rateLimitEnabled} />
            <Checkbox
              label="Block orders if they contain more than X quantity of products"
              checked={maxQtyBlockEnabled}
              onChange={setMaxQtyBlockEnabled}
            />
            <TextField label="Max quantity allowed" type="number" value={maxQtyBlockValue} onChange={setMaxQtyBlockValue} autoComplete="off" disabled={!maxQtyBlockEnabled} />
          </FormLayout>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Blocklists</Text>
          <FormLayout>
            <FormLayout.Group>
              <TextField label="Emails to block (comma-separated)" value={blockedEmails} onChange={setBlockedEmails} autoComplete="off" multiline={3} />
              <TextField label="Phone numbers to block (comma-separated)" value={blockedPhoneNumbers} onChange={setBlockedPhoneNumbers} autoComplete="off" multiline={3} />
            </FormLayout.Group>
            <FormLayout.Group>
              <TextField label="IP addresses to block (comma-separated)" value={blockedIps} onChange={setBlockedIps} autoComplete="off" multiline={3} />
              <TextField label="IP addresses to always allow (comma-separated)" value={allowedIps} onChange={setAllowedIps} autoComplete="off" multiline={3} />
            </FormLayout.Group>
            <TextField label="Message to show when an order is blocked" value={blockedOrderMessage} onChange={setBlockedOrderMessage} autoComplete="off" />
          </FormLayout>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Postal codes</Text>
          <FormLayout>
            <Select
              label="Postal code restriction"
              options={[
                { label: "No restriction", value: "none" },
                { label: "Exclude a list of postal codes", value: "exclude" },
                { label: "Allow only a list of postal codes", value: "allow_only" },
              ]}
              value={postalCodeMode}
              onChange={setPostalCodeMode}
            />
            <TextField
              label="Postal codes (comma-separated)"
              value={postalCodes}
              onChange={setPostalCodes}
              autoComplete="off"
              disabled={postalCodeMode === "none"}
            />
          </FormLayout>
        </BlockStack>
      </Card>

      <Banner tone="info" title="Invisible Bot Protection">
        <p>
          Hidden-field and behavioral-tracking bot detection is a larger
          feature (needs client-side fingerprinting + a scoring model) —
          not implemented in this scaffold.
        </p>
      </Banner>

      <InlineStack align="end">
        <Button variant="primary" loading={isSaving} onClick={handleSave}>
          Save
        </Button>
      </InlineStack>
    </BlockStack>
  );
}

function UserVerificationTab({ settings, submit, isSaving }: any) {
  const [requirePhoneOtp, setRequirePhoneOtp] = useState(settings.requirePhoneOtp);
  const [otpMessageText, setOtpMessageText] = useState(settings.otpMessageText);

  const handleSave = useCallback(() => {
    const data = new FormData();
    data.set("intent", "save-verification");
    data.set("requirePhoneOtp", String(requirePhoneOtp));
    data.set("otpMessageText", otpMessageText);
    submit(data, { method: "post" });
  }, [requirePhoneOtp, otpMessageText, submit]);

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="300">
          <InlineStack align="space-between">
            <Text as="h2" variant="headingMd">SMS credits</Text>
            <Text as="span" variant="headingLg">${settings.smsCreditsBalance.toFixed(2)}</Text>
          </InlineStack>
          <Banner tone="info">
            OTP messages are billed per SMS via your connected provider
            (Settings &amp; Integrations). Top-up UI is a stub — wire it to
            Shopify's one-time-purchase billing API or your SMS provider's
            own billing to make this real.
          </Banner>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Phone verification</Text>
          <FormLayout>
            <Checkbox
              label="Require phone OTP verification before an order is created"
              checked={requirePhoneOtp}
              onChange={setRequirePhoneOtp}
              helpText="Reduces fake and prank COD orders"
            />
            <TextField
              label="Verification SMS text"
              value={otpMessageText}
              onChange={setOtpMessageText}
              autoComplete="off"
              helpText="Available variables: {{shop_name}}, {{otp_code}}"
              disabled={!requirePhoneOtp}
            />
          </FormLayout>
          <div>
            <Button variant="primary" loading={isSaving} onClick={handleSave}>
              Save
            </Button>
          </div>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

function PartialPaymentsTab({ settings, submit, isSaving }: any) {
  const [enabled, setEnabled] = useState(settings.partialPaymentEnabled);

  const handleSave = useCallback(() => {
    const data = new FormData();
    data.set("intent", "save-partial-payments");
    data.set("partialPaymentEnabled", String(enabled));
    submit(data, { method: "post" });
  }, [enabled, submit]);

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">Partial Payments</Text>
        <FormLayout>
          <Checkbox
            label="Enable Partial Payment integration with COD Fee"
            checked={enabled}
            onChange={setEnabled}
            helpText="When enabled, customers who click 'Pay with Card' see partial payment options — requires a separate COD Fee & Partial Pay app/checkout-extension to actually collect the split payment. Not implemented in this scaffold."
          />
        </FormLayout>
        <div>
          <Button variant="primary" loading={isSaving} onClick={handleSave}>
            Save
          </Button>
        </div>
      </BlockStack>
    </Card>
  );
}
