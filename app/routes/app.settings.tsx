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
  Tabs,
  Banner,
  InlineStack,
  Button,
  Modal,
  IndexTable,
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
  const pixels = await prisma.pixelIntegration.findMany({
    where: { shopSettingsId: settings.id },
  });
  return json({ settings, pixels });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  const settings = await prisma.shopSettings.upsert({
    where: { shop: session.shop },
    update: {},
    create: { shop: session.shop },
  });

  if (intent === "save-visibility") {
    const minRaw = String(form.get("minOrderValue") || "");
    const maxRaw = String(form.get("maxOrderValue") || "");
    await prisma.shopSettings.update({
      where: { shop: session.shop },
      data: {
        formVisibility: String(form.get("formVisibility") || "both"),
        hideCheckoutOnCart: form.get("hideCheckoutOnCart") === "true",
        productClickBehavior: String(form.get("productClickBehavior") || "buy_current_product"),
        hideAddToCart: form.get("hideAddToCart") === "true",
        hideBuyNow: form.get("hideBuyNow") === "true",
        disableOnHomePage: form.get("disableOnHomePage") === "true",
        disableOnCollectionPages: form.get("disableOnCollectionPages") === "true",
        specificProductsMode: String(form.get("specificProductsMode") || "none"),
        specificProductIds: String(form.get("specificProductIds") || "") || null,
        specificCollectionsMode: String(form.get("specificCollectionsMode") || "none"),
        specificCollectionIds: String(form.get("specificCollectionIds") || "") || null,
        allowedCountries: String(form.get("allowedCountries") || "") || null,
        minOrderValue: minRaw ? Number(minRaw) : null,
        maxOrderValue: maxRaw ? Number(maxRaw) : null,
      },
    });
  } else if (intent === "save-general") {
    await prisma.shopSettings.update({
      where: { shop: session.shop },
      data: {
        formVersion: String(form.get("formVersion") || "new"),
        multiStepEnabled: form.get("multiStepEnabled") === "true",
        multiStepCount: Number(form.get("multiStepCount") || 2),
        saveOrdersAsDraft: form.get("saveOrdersAsDraft") === "true",
        saveUtmParams: form.get("saveUtmParams") === "true",
        addAppTag: form.get("addAppTag") === "true",
        redirectAfterPurchase: String(form.get("redirectAfterPurchase") || "default"),
        redirectCustomValue: String(form.get("redirectCustomValue") || "") || null,
        messagingChannel: String(form.get("messagingChannel") || "sms"),
        taxEnabled: form.get("taxEnabled") === "true",
        taxRate: Number(form.get("taxRate") || 0),
        taxName: String(form.get("taxName") || "VAT"),
        taxAppliesTo: String(form.get("taxAppliesTo") || "all"),
        taxIncludedInPrice: form.get("taxIncludedInPrice") === "true",
        codFeeEnabled: form.get("codFeeEnabled") === "true",
        customCss: String(form.get("customCss") || "") || null,
      },
    });
  } else if (intent === "reset-form-settings") {
    await prisma.shopSettings.update({
      where: { shop: session.shop },
      data: {
        formTitle: "Complete your Cash on Delivery order",
        primaryColor: "#1a1a1a",
        buttonText: "Confirm Cash on Delivery Order",
        formFieldsConfig: null,
        customCss: null,
      },
    });
  } else if (intent === "reset-onboarding") {
    await prisma.shopSettings.update({
      where: { shop: session.shop },
      data: { onboardingCompleted: false },
    });
  } else if (intent === "save-pixel-settings") {
    await prisma.shopSettings.update({
      where: { shop: session.shop },
      data: { disableAllPixelEvents: form.get("disableAllPixelEvents") === "true" },
    });
  } else if (intent === "add-pixel") {
    await prisma.pixelIntegration.create({
      data: {
        shopSettingsId: settings.id,
        platform: String(form.get("platform")),
        label: String(form.get("label")),
        pixelId: String(form.get("pixelId")),
      },
    });
  } else if (intent === "delete-pixel") {
    await prisma.pixelIntegration.delete({ where: { id: String(form.get("id")) } });
  } else if (intent === "save-integrations") {
    const apiKeyRaw = String(form.get("smsApiKey") || "");
    await prisma.shopSettings.update({
      where: { shop: session.shop },
      data: {
        smsProviderName: String(form.get("smsProviderName") || "") || null,
        ...(apiKeyRaw ? { smsApiKey: apiKeyRaw } : {}),
      },
    });
  }

  return json({ ok: true });
};

export default function Settings() {
  const { settings, pixels } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [tab, setTab] = useState(0);

  const tabs = [
    { id: "visibility", content: "Visibility" },
    { id: "general", content: "General" },
    { id: "pixels", content: "Pixels" },
    { id: "sheets", content: "Google Sheets" },
    { id: "partners", content: "Partners & Integrations" },
  ];

  return (
    <Page title="Settings & Integrations">
      <BlockStack gap="400">
        <Tabs tabs={tabs} selected={tab} onSelect={setTab} />
        {tab === 0 && <VisibilityTab settings={settings} submit={submit} />}
        {tab === 1 && <GeneralTab settings={settings} submit={submit} />}
        {tab === 2 && <PixelsTab settings={settings} pixels={pixels} submit={submit} />}
        {tab === 3 && <GoogleSheetsTab settings={settings} />}
        {tab === 4 && <PartnersTab settings={settings} submit={submit} />}
      </BlockStack>
    </Page>
  );
}

function VisibilityTab({ settings, submit }: any) {
  const [formVisibility, setFormVisibility] = useState(settings.formVisibility);
  const [hideCheckoutOnCart, setHideCheckoutOnCart] = useState(settings.hideCheckoutOnCart);
  const [productClickBehavior, setProductClickBehavior] = useState(settings.productClickBehavior);
  const [hideAddToCart, setHideAddToCart] = useState(settings.hideAddToCart);
  const [hideBuyNow, setHideBuyNow] = useState(settings.hideBuyNow);
  const [disableOnHomePage, setDisableOnHomePage] = useState(settings.disableOnHomePage);
  const [disableOnCollectionPages, setDisableOnCollectionPages] = useState(settings.disableOnCollectionPages);
  const [specificProductsMode, setSpecificProductsMode] = useState(settings.specificProductsMode);
  const [specificProductIds, setSpecificProductIds] = useState(settings.specificProductIds ?? "");
  const [specificCollectionsMode, setSpecificCollectionsMode] = useState(settings.specificCollectionsMode);
  const [specificCollectionIds, setSpecificCollectionIds] = useState(settings.specificCollectionIds ?? "");
  const [allowedCountries, setAllowedCountries] = useState(settings.allowedCountries ?? "");
  const [minOrderValue, setMinOrderValue] = useState(settings.minOrderValue?.toString() ?? "");
  const [maxOrderValue, setMaxOrderValue] = useState(settings.maxOrderValue?.toString() ?? "");

  const handleSave = useCallback(() => {
    const data = new FormData();
    data.set("intent", "save-visibility");
    data.set("formVisibility", formVisibility);
    data.set("hideCheckoutOnCart", String(hideCheckoutOnCart));
    data.set("productClickBehavior", productClickBehavior);
    data.set("hideAddToCart", String(hideAddToCart));
    data.set("hideBuyNow", String(hideBuyNow));
    data.set("disableOnHomePage", String(disableOnHomePage));
    data.set("disableOnCollectionPages", String(disableOnCollectionPages));
    data.set("specificProductsMode", specificProductsMode);
    data.set("specificProductIds", specificProductIds);
    data.set("specificCollectionsMode", specificCollectionsMode);
    data.set("specificCollectionIds", specificCollectionIds);
    data.set("allowedCountries", allowedCountries);
    data.set("minOrderValue", minOrderValue);
    data.set("maxOrderValue", maxOrderValue);
    submit(data, { method: "post" });
  }, [formVisibility, hideCheckoutOnCart, productClickBehavior, hideAddToCart, hideBuyNow, disableOnHomePage, disableOnCollectionPages, specificProductsMode, specificProductIds, specificCollectionsMode, specificCollectionIds, allowedCountries, minOrderValue, maxOrderValue, submit]);

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Enable or disable your form</Text>
          <Select
            label="Where should the form show?"
            options={[
              { label: "Disabled", value: "disabled" },
              { label: "Only cart page", value: "cart_only" },
              { label: "Only product pages", value: "product_only" },
              { label: "Both cart and product pages", value: "both" },
            ]}
            value={formVisibility}
            onChange={setFormVisibility}
          />
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Cart page settings</Text>
          <Checkbox label="Hide the Checkout button on your cart" checked={hideCheckoutOnCart} onChange={setHideCheckoutOnCart} />
          <Text as="h2" variant="headingMd">Product page settings</Text>
          <Select
            label="When the COD button is clicked on product pages"
            options={[
              { label: "Buy only current product", value: "buy_current_product" },
              { label: "Buy the whole cart", value: "buy_all_cart" },
            ]}
            value={productClickBehavior}
            onChange={setProductClickBehavior}
          />
          <Checkbox label="Hide the Add to Cart button on product pages" checked={hideAddToCart} onChange={setHideAddToCart} />
          <Checkbox label="Hide the Buy Now button on product pages" checked={hideBuyNow} onChange={setHideBuyNow} />
          <Text as="h2" variant="headingMd">Other pages</Text>
          <Checkbox label="Disable on your home page" checked={disableOnHomePage} onChange={setDisableOnHomePage} />
          <Checkbox label="Disable on your collections pages" checked={disableOnCollectionPages} onChange={setDisableOnCollectionPages} />
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Limit to specific products, collections, countries, or order totals</Text>
          <FormLayout>
            <FormLayout.Group>
              <Select label="Products" options={[{ label: "All products", value: "none" }, { label: "Only these products", value: "only" }, { label: "Exclude these products", value: "exclude" }]} value={specificProductsMode} onChange={setSpecificProductsMode} />
              <TextField label="Product IDs (comma-separated)" value={specificProductIds} onChange={setSpecificProductIds} autoComplete="off" disabled={specificProductsMode === "none"} />
            </FormLayout.Group>
            <FormLayout.Group>
              <Select label="Collections" options={[{ label: "All collections", value: "none" }, { label: "Only these collections", value: "only" }, { label: "Exclude these collections", value: "exclude" }]} value={specificCollectionsMode} onChange={setSpecificCollectionsMode} />
              <TextField label="Collection IDs (comma-separated)" value={specificCollectionIds} onChange={setSpecificCollectionIds} autoComplete="off" disabled={specificCollectionsMode === "none"} />
            </FormLayout.Group>
            <TextField label="Allowed countries (comma-separated ISO codes, blank = all)" value={allowedCountries} onChange={setAllowedCountries} autoComplete="off" />
            <FormLayout.Group>
              <TextField label="Minimum order total" type="number" value={minOrderValue} onChange={setMinOrderValue} autoComplete="off" placeholder="No minimum" />
              <TextField label="Maximum order total" type="number" value={maxOrderValue} onChange={setMaxOrderValue} autoComplete="off" placeholder="No maximum" />
            </FormLayout.Group>
          </FormLayout>
          <Banner tone="info">
            Country and order-total limits are enforced server-side in
            api.cod-submit.tsx. Product/collection targeting is stored here
            but not yet checked there — add that condition alongside the
            existing checks if you need it enforced too.
          </Banner>
        </BlockStack>
      </Card>

      <InlineStack align="end">
        <Button variant="primary" onClick={handleSave}>Save</Button>
      </InlineStack>
    </BlockStack>
  );
}

function GeneralTab({ settings, submit }: any) {
  const [formVersion, setFormVersion] = useState(settings.formVersion);
  const [multiStepEnabled, setMultiStepEnabled] = useState(settings.multiStepEnabled);
  const [multiStepCount, setMultiStepCount] = useState(String(settings.multiStepCount));
  const [saveOrdersAsDraft, setSaveOrdersAsDraft] = useState(settings.saveOrdersAsDraft);
  const [saveUtmParams, setSaveUtmParams] = useState(settings.saveUtmParams);
  const [addAppTag, setAddAppTag] = useState(settings.addAppTag);
  const [redirectAfterPurchase, setRedirectAfterPurchase] = useState(settings.redirectAfterPurchase);
  const [redirectCustomValue, setRedirectCustomValue] = useState(settings.redirectCustomValue ?? "");
  const [messagingChannel, setMessagingChannel] = useState(settings.messagingChannel);
  const [taxEnabled, setTaxEnabled] = useState(settings.taxEnabled);
  const [taxRate, setTaxRate] = useState(String(settings.taxRate));
  const [taxName, setTaxName] = useState(settings.taxName);
  const [taxAppliesTo, setTaxAppliesTo] = useState(settings.taxAppliesTo);
  const [taxIncludedInPrice, setTaxIncludedInPrice] = useState(settings.taxIncludedInPrice);
  const [codFeeEnabled, setCodFeeEnabled] = useState(settings.codFeeEnabled);
  const [customCss, setCustomCss] = useState(settings.customCss ?? "");

  const handleSave = useCallback(() => {
    const data = new FormData();
    data.set("intent", "save-general");
    data.set("formVersion", formVersion);
    data.set("multiStepEnabled", String(multiStepEnabled));
    data.set("multiStepCount", multiStepCount);
    data.set("saveOrdersAsDraft", String(saveOrdersAsDraft));
    data.set("saveUtmParams", String(saveUtmParams));
    data.set("addAppTag", String(addAppTag));
    data.set("redirectAfterPurchase", redirectAfterPurchase);
    data.set("redirectCustomValue", redirectCustomValue);
    data.set("messagingChannel", messagingChannel);
    data.set("taxEnabled", String(taxEnabled));
    data.set("taxRate", taxRate);
    data.set("taxName", taxName);
    data.set("taxAppliesTo", taxAppliesTo);
    data.set("taxIncludedInPrice", String(taxIncludedInPrice));
    data.set("codFeeEnabled", String(codFeeEnabled));
    data.set("customCss", customCss);
    submit(data, { method: "post" });
  }, [formVersion, multiStepEnabled, multiStepCount, saveOrdersAsDraft, saveUtmParams, addAppTag, redirectAfterPurchase, redirectCustomValue, messagingChannel, taxEnabled, taxRate, taxName, taxAppliesTo, taxIncludedInPrice, codFeeEnabled, customCss, submit]);

  const resetFormSettings = () => {
    const data = new FormData();
    data.set("intent", "reset-form-settings");
    submit(data, { method: "post" });
  };
  const resetOnboarding = () => {
    const data = new FormData();
    data.set("intent", "reset-onboarding");
    submit(data, { method: "post" });
  };

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Form version</Text>
          <Select
            label="Preferred COD form version"
            options={[{ label: "New form version", value: "new" }, { label: "Legacy version", value: "legacy" }]}
            value={formVersion}
            onChange={setFormVersion}
          />
          <Checkbox label="Enable a multi-step form" checked={multiStepEnabled} onChange={setMultiStepEnabled} helpText="Breaks the form into steps — customers can navigate back and forth" />
          <TextField label="Number of steps" type="number" value={multiStepCount} onChange={setMultiStepCount} autoComplete="off" disabled={!multiStepEnabled} />
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Order behavior</Text>
          <FormLayout>
            <Checkbox
              label="Create orders with the Cash on Delivery (COD) payment method"
              checked={!saveOrdersAsDraft}
              onChange={(checked) => setSaveOrdersAsDraft(!checked)}
              helpText="On: creates a real order immediately (orderCreate). Off: creates a draft order a staff member reviews and completes (draftOrderCreate) — the safer default."
            />
            <Checkbox label="Save UTM parameters on the order's additional details" checked={saveUtmParams} onChange={setSaveUtmParams} />
            <Checkbox label={`Add the "COD" tag to orders from the COD form`} checked={addAppTag} onChange={setAddAppTag} />
            <Checkbox label="Charge an extra fee for Cash on Delivery orders" checked={codFeeEnabled} onChange={setCodFeeEnabled} helpText="Configure the amount under Form Designer" />
          </FormLayout>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">After purchase</Text>
          <Select
            label="Redirect customers to"
            options={[
              { label: "Default Shopify thank-you page", value: "default" },
              { label: "A custom link", value: "custom_link" },
              { label: "WhatsApp chat with you", value: "whatsapp" },
              { label: "A custom thank-you message on the form", value: "custom_message" },
            ]}
            value={redirectAfterPurchase}
            onChange={setRedirectAfterPurchase}
          />
          <TextField label="Value (URL, phone number, or message)" value={redirectCustomValue} onChange={setRedirectCustomValue} autoComplete="off" disabled={redirectAfterPurchase === "default"} />
          <Select label="Messaging channel preference" options={[{ label: "SMS", value: "sms" }, { label: "WhatsApp", value: "whatsapp" }]} value={messagingChannel} onChange={setMessagingChannel} />
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Tax</Text>
          <FormLayout>
            <Checkbox label="Add a tax calculation to orders from the COD form" checked={taxEnabled} onChange={setTaxEnabled} />
            <FormLayout.Group>
              <TextField label="Tax rate (%)" type="number" value={taxRate} onChange={setTaxRate} autoComplete="off" disabled={!taxEnabled} />
              <TextField label="Tax name" value={taxName} onChange={setTaxName} autoComplete="off" disabled={!taxEnabled} />
            </FormLayout.Group>
            <Select label="Applies to" options={[{ label: "All products", value: "all" }, { label: "Specific collections", value: "specific_collections" }]} value={taxAppliesTo} onChange={setTaxAppliesTo} disabled={!taxEnabled} />
            <Checkbox label="Tax is already included in product price" checked={taxIncludedInPrice} onChange={setTaxIncludedInPrice} disabled={!taxEnabled} />
          </FormLayout>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Custom CSS</Text>
          <TextField label="Custom CSS for your form" value={customCss} onChange={setCustomCss} autoComplete="off" multiline={6} />
        </BlockStack>
      </Card>

      <InlineStack align="end">
        <Button variant="primary" onClick={handleSave}>Save</Button>
      </InlineStack>

      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Reset settings</Text>
          <InlineStack gap="300">
            <Button tone="critical" onClick={resetFormSettings}>Reset Form Designer settings</Button>
            <Button onClick={resetOnboarding}>Redo onboarding</Button>
          </InlineStack>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

const PIXEL_PLATFORMS = [
  { label: "Facebook Pixel", value: "facebook" },
  { label: "Facebook Conversions API", value: "facebook_capi" },
  { label: "Google Analytics (GA4)", value: "google_ga4" },
  { label: "TikTok Pixel", value: "tiktok" },
  { label: "TikTok Events API", value: "tiktok_events_api" },
  { label: "Snapchat Pixel", value: "snapchat" },
  { label: "Pinterest Tag", value: "pinterest" },
  { label: "ShareChat Tag", value: "sharechat" },
  { label: "Taboola Tag", value: "taboola" },
  { label: "Kwai Tag", value: "kwai" },
];

function PixelsTab({ settings, pixels, submit }: any) {
  const [disableAll, setDisableAll] = useState(settings.disableAllPixelEvents);
  const [modalOpen, setModalOpen] = useState(false);
  const [platform, setPlatform] = useState("facebook");
  const [label, setLabel] = useState("");
  const [pixelId, setPixelId] = useState("");

  const toggleDisableAll = (checked: boolean) => {
    setDisableAll(checked);
    const data = new FormData();
    data.set("intent", "save-pixel-settings");
    data.set("disableAllPixelEvents", String(checked));
    submit(data, { method: "post" });
  };

  const handleAdd = useCallback(() => {
    const data = new FormData();
    data.set("intent", "add-pixel");
    data.set("platform", platform);
    data.set("label", label);
    data.set("pixelId", pixelId);
    submit(data, { method: "post" });
    setModalOpen(false);
    setLabel("");
    setPixelId("");
  }, [platform, label, pixelId, submit]);

  const del = (id: string) => {
    const data = new FormData();
    data.set("intent", "delete-pixel");
    data.set("id", id);
    submit(data, { method: "post" });
  };

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="300">
          <InlineStack align="space-between">
            <Text as="h2" variant="headingMd">Configure your analytics pixels</Text>
            <Button onClick={() => setModalOpen(true)}>Add item</Button>
          </InlineStack>
          <Text as="p" tone="subdued">
            Track form purchases and events across ad platforms. This
            scaffold stores pixel IDs and shows them to the merchant — it
            doesn't yet fire the actual tracking events client-side. Add
            that in cod-form.js's submit handler, reading these pixel
            records via a small public GET endpoint.
          </Text>
          {pixels.length === 0 ? (
            <Text as="p" tone="subdued">No pixels configured yet.</Text>
          ) : (
            <IndexTable
              resourceName={{ singular: "pixel", plural: "pixels" }}
              itemCount={pixels.length}
              headings={[{ title: "Type" }, { title: "Label" }, { title: "ID" }, { title: "" }]}
              selectable={false}
            >
              {pixels.map((p: any, i: number) => (
                <IndexTable.Row id={p.id} key={p.id} position={i}>
                  <IndexTable.Cell>
                    {PIXEL_PLATFORMS.find((x) => x.value === p.platform)?.label ?? p.platform}
                  </IndexTable.Cell>
                  <IndexTable.Cell>{p.label}</IndexTable.Cell>
                  <IndexTable.Cell>{p.pixelId}</IndexTable.Cell>
                  <IndexTable.Cell>
                    <Button size="slim" tone="critical" onClick={() => del(p.id)}>Delete</Button>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
        </BlockStack>
      </Card>

      <Card>
        <Checkbox
          label="Disable all events sent by the app on this store"
          checked={disableAll}
          onChange={toggleDisableAll}
        />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add a pixel"
        primaryAction={{ content: "Add", onAction: handleAdd }}
        secondaryActions={[{ content: "Cancel", onAction: () => setModalOpen(false) }]}
      >
        <Modal.Section>
          <FormLayout>
            <Select label="Platform" options={PIXEL_PLATFORMS} value={platform} onChange={setPlatform} />
            <TextField label="Label" value={label} onChange={setLabel} autoComplete="off" placeholder="Main FB pixel" />
            <TextField label="Pixel / tag ID" value={pixelId} onChange={setPixelId} autoComplete="off" />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}

function GoogleSheetsTab({ settings }: any) {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">Google Sheets</Text>
        <Text as="p" tone="subdued">
          Import your COD form orders automatically into Google Sheets.
        </Text>
        {settings.googleSheetsConnected ? (
          <Banner tone="success">Connected as {settings.googleSheetsEmail}</Banner>
        ) : (
          <Banner tone="info">
            Real Google OAuth (consent screen, token storage, and the Sheets
            API write) isn't implemented in this scaffold — this is a UI
            stub. To build it: register a Google Cloud OAuth client, add a
            `/auth/google` + `/auth/google/callback` route pair storing
            refresh tokens on ShopSettings, and a scheduled job that appends
            new CodSubmission rows via the Sheets API.
          </Banner>
        )}
        <div>
          <Button disabled>Sign in with Google</Button>
        </div>
      </BlockStack>
    </Card>
  );
}

function PartnersTab({ settings, submit }: any) {
  const [smsProviderName, setSmsProviderName] = useState(settings.smsProviderName ?? "");
  const [smsApiKey, setSmsApiKey] = useState("");

  const handleSave = useCallback(() => {
    const data = new FormData();
    data.set("intent", "save-integrations");
    data.set("smsProviderName", smsProviderName);
    data.set("smsApiKey", smsApiKey);
    submit(data, { method: "post" });
  }, [smsProviderName, smsApiKey, submit]);

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">SMS / WhatsApp provider</Text>
          <Banner tone="info">
            Required for OTP verification (Fraud Prevention) and delivery
            messages (Delivery Success).
          </Banner>
          <FormLayout>
            <Select
              label="Provider"
              options={[{ label: "None", value: "" }, { label: "Twilio", value: "twilio" }, { label: "MSG91", value: "msg91" }]}
              value={smsProviderName}
              onChange={setSmsProviderName}
            />
            <TextField
              label="API key"
              value={smsApiKey}
              onChange={setSmsApiKey}
              autoComplete="off"
              type="password"
              placeholder={settings.smsApiKey ? "•••••••••• (saved — leave blank to keep)" : ""}
            />
          </FormLayout>
          <div>
            <Button variant="primary" onClick={handleSave}>Save</Button>
          </div>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Partner marketplace</Text>
          <Text as="p" tone="subdued">
            Releasit's real Partners tab is a curated directory of COD
            dropshipping platforms, fulfillment providers, and complementary
            apps — purely informational/marketing content with no backend
            logic. Reproducing the full directory isn't meaningful for a
            scaffold; this tab is a placeholder for that static content.
          </Text>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
