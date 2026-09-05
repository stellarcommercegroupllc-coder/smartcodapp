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
  InlineStack,
  Text,
  Button,
  Box,
  Badge,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

type FieldConfig = {
  key: string;
  label: string;
  enabled: boolean;
  required: boolean;
};

const DEFAULT_FIELDS: FieldConfig[] = [
  { key: "firstName", label: "First Name", enabled: true, required: true },
  { key: "lastName", label: "Last Name", enabled: true, required: false },
  { key: "phone", label: "Phone number", enabled: true, required: true },
  { key: "email", label: "Email", enabled: true, required: false },
  { key: "address1", label: "Address 1", enabled: true, required: true },
  { key: "address2", label: "Address 2", enabled: false, required: false },
  { key: "state", label: "State", enabled: true, required: true },
  { key: "city", label: "City", enabled: true, required: true },
  { key: "zip", label: "Pin / ZIP code", enabled: true, required: true },
  { key: "orderNote", label: "Order note", enabled: false, required: false },
];

function parseFields(raw: string | null): FieldConfig[] {
  if (!raw) return DEFAULT_FIELDS;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    /* fall through to default */
  }
  return DEFAULT_FIELDS;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.shopSettings.upsert({
    where: { shop: session.shop },
    update: {},
    create: { shop: session.shop },
  });
  return json({ settings, fields: parseFields(settings.formFieldsConfig) });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();

  await prisma.shopSettings.update({
    where: { shop: session.shop },
    data: {
      formTitle: String(form.get("formTitle") || ""),
      primaryColor: String(form.get("primaryColor") || "#1a1a1a"),
      buttonText: String(form.get("buttonText") || ""),
      formFieldsConfig: String(form.get("formFieldsConfig") || ""),
      showOnProductPage: form.get("showOnProductPage") === "true",
      showOnCartPage: form.get("showOnCartPage") === "true",
      codFeeEnabled: form.get("codFeeEnabled") === "true",
      codFeeAmount: Number(form.get("codFeeAmount") || 0),
      codFeeType: String(form.get("codFeeType") || "fixed"),
    },
  });

  return json({ ok: true });
};

export default function FormDesigner() {
  const { settings, fields: initialFields } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const [formTitle, setFormTitle] = useState(settings.formTitle);
  const [primaryColor, setPrimaryColor] = useState(settings.primaryColor);
  const [buttonText, setButtonText] = useState(settings.buttonText);
  const [fields, setFields] = useState<FieldConfig[]>(initialFields);
  const [showOnProductPage, setShowOnProductPage] = useState(
    settings.showOnProductPage,
  );
  const [showOnCartPage, setShowOnCartPage] = useState(settings.showOnCartPage);
  const [codFeeEnabled, setCodFeeEnabled] = useState(settings.codFeeEnabled);
  const [codFeeAmount, setCodFeeAmount] = useState(String(settings.codFeeAmount));
  const [codFeeType, setCodFeeType] = useState(settings.codFeeType);

  const toggleField = (key: string, prop: "enabled" | "required") => {
    setFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, [prop]: !f[prop] } : f)),
    );
  };

  const moveField = (index: number, dir: -1 | 1) => {
    setFields((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSave = useCallback(() => {
    const data = new FormData();
    data.set("formTitle", formTitle);
    data.set("primaryColor", primaryColor);
    data.set("buttonText", buttonText);
    data.set("formFieldsConfig", JSON.stringify(fields));
    data.set("showOnProductPage", String(showOnProductPage));
    data.set("showOnCartPage", String(showOnCartPage));
    data.set("codFeeEnabled", String(codFeeEnabled));
    data.set("codFeeAmount", codFeeAmount);
    data.set("codFeeType", codFeeType);
    submit(data, { method: "post" });
  }, [
    formTitle,
    primaryColor,
    buttonText,
    fields,
    showOnProductPage,
    showOnCartPage,
    codFeeEnabled,
    codFeeAmount,
    codFeeType,
    submit,
  ]);

  return (
    <Page
      title="Form Designer"
      primaryAction={{
        content: "Save",
        loading: isSaving,
        onAction: handleSave,
      }}
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Form fields
            </Text>
            <Text as="p" tone="subdued">
              Enable, require, and reorder the fields shown on your COD form.
            </Text>
            <BlockStack gap="150">
              {fields.map((f, index) => (
                <Box
                  key={f.key}
                  padding="200"
                  borderWidth="025"
                  borderColor="border"
                  borderRadius="200"
                >
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="200" blockAlign="center">
                      <Button
                        size="micro"
                        onClick={() => moveField(index, -1)}
                        disabled={index === 0}
                        accessibilityLabel="Move up"
                      >
                        ↑
                      </Button>
                      <Button
                        size="micro"
                        onClick={() => moveField(index, 1)}
                        disabled={index === fields.length - 1}
                        accessibilityLabel="Move down"
                      >
                        ↓
                      </Button>
                      <Text as="span" fontWeight="medium">
                        {f.label}
                      </Text>
                    </InlineStack>
                    <InlineStack gap="400">
                      <Checkbox
                        label="Enabled"
                        checked={f.enabled}
                        onChange={() => toggleField(f.key, "enabled")}
                      />
                      <Checkbox
                        label="Required"
                        checked={f.required}
                        disabled={!f.enabled}
                        onChange={() => toggleField(f.key, "required")}
                      />
                    </InlineStack>
                  </InlineStack>
                </Box>
              ))}
            </BlockStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Appearance &amp; buy button
            </Text>
            <FormLayout>
              <TextField
                label="Form title"
                value={formTitle}
                onChange={setFormTitle}
                autoComplete="off"
              />
              <TextField
                label="Button text"
                value={buttonText}
                onChange={setButtonText}
                autoComplete="off"
              />
              <TextField
                label="Primary color"
                value={primaryColor}
                onChange={setPrimaryColor}
                autoComplete="off"
                helpText="Hex color used for the form's buttons and accents"
              />
              <Checkbox
                label="Show form on product page"
                checked={showOnProductPage}
                onChange={setShowOnProductPage}
              />
              <Checkbox
                label="Show form on cart page"
                checked={showOnCartPage}
                onChange={setShowOnCartPage}
              />
            </FormLayout>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              COD fee
            </Text>
            <FormLayout>
              <Checkbox
                label="Charge an extra fee for Cash on Delivery orders"
                checked={codFeeEnabled}
                onChange={setCodFeeEnabled}
              />
              <FormLayout.Group>
                <TextField
                  label="Fee amount"
                  type="number"
                  value={codFeeAmount}
                  onChange={setCodFeeAmount}
                  autoComplete="off"
                  disabled={!codFeeEnabled}
                />
                <Select
                  label="Fee type"
                  options={[
                    { label: "Fixed amount", value: "fixed" },
                    { label: "Percentage of cart", value: "percentage" },
                  ]}
                  value={codFeeType}
                  onChange={setCodFeeType}
                  disabled={!codFeeEnabled}
                />
              </FormLayout.Group>
            </FormLayout>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">
                Form versions
              </Text>
              <Badge tone="info">Default</Badge>
            </InlineStack>
            <Text as="p" tone="subdued">
              A/B testing multiple form versions is a Sales Booster feature
              on higher plans — this scaffold ships a single "Default"
              version. Wire in a `FormVersion` model (title + weight +
              settings snapshot) plus weighted random selection in the
              storefront JS if you want to build this out.
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
