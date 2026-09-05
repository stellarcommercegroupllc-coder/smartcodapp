import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page,
  Card,
  FormLayout,
  TextField,
  Select,
  Button,
  IndexTable,
  Text,
  BlockStack,
  Modal,
  Badge,
  Tabs,
  Checkbox,
  Banner,
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
  const bundles = await prisma.bundleOffer.findMany({
    where: { shopSettingsId: settings.id },
    orderBy: { sortOrder: "asc" },
  });
  const upsells = await prisma.upsellOffer.findMany({
    where: { shopSettingsId: settings.id },
    orderBy: { createdAt: "desc" },
  });
  return json({ settings, bundles, upsells });
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

  if (intent === "create-bundle") {
    await prisma.bundleOffer.create({
      data: {
        shopSettingsId: settings.id,
        title: String(form.get("title")),
        productId: String(form.get("productId") || "all"),
        minQuantity: Number(form.get("minQuantity") || 2),
        discountType: String(form.get("discountType") || "percentage"),
        discountValue: Number(form.get("discountValue") || 10),
      },
    });
  } else if (intent === "delete-bundle") {
    await prisma.bundleOffer.delete({ where: { id: String(form.get("id")) } });
  } else if (intent === "toggle-bundle") {
    const bundle = await prisma.bundleOffer.findUnique({
      where: { id: String(form.get("id")) },
    });
    if (bundle) {
      await prisma.bundleOffer.update({
        where: { id: bundle.id },
        data: { isActive: !bundle.isActive },
      });
    }
  } else if (intent === "create-upsell") {
    await prisma.upsellOffer.create({
      data: {
        shopSettingsId: settings.id,
        title: String(form.get("title")),
        triggerProductId: String(form.get("triggerProductId")),
        offerProductId: String(form.get("offerProductId")),
        offerType: String(form.get("offerType") || "upsell"),
        discountType: String(form.get("discountType") || "percentage"),
        discountValue: Number(form.get("discountValue") || 10),
      },
    });
  } else if (intent === "delete-upsell") {
    await prisma.upsellOffer.delete({ where: { id: String(form.get("id")) } });
  } else if (intent === "toggle-upsell") {
    const upsell = await prisma.upsellOffer.findUnique({
      where: { id: String(form.get("id")) },
    });
    if (upsell) {
      await prisma.upsellOffer.update({
        where: { id: upsell.id },
        data: { isActive: !upsell.isActive },
      });
    }
  } else if (intent === "save-abandoned-cart") {
    await prisma.shopSettings.update({
      where: { shop: session.shop },
      data: {
        abandonedCartEnabled: form.get("abandonedCartEnabled") === "true",
        abandonedCartDelayHours: Number(form.get("abandonedCartDelayHours") || 1),
        abandonedCartMessage: String(form.get("abandonedCartMessage") || ""),
      },
    });
  }

  return json({ ok: true });
};

export default function SalesBooster() {
  const { settings, bundles, upsells } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [tab, setTab] = useState(0);

  const tabs = [
    { id: "quantity", content: "Quantity Offers" },
    { id: "upsells", content: "Upsells & Downsells" },
    { id: "abandoned", content: "Abandoned cart" },
  ];

  return (
    <Page title="Sales Booster">
      <BlockStack gap="400">
        <Tabs tabs={tabs} selected={tab} onSelect={setTab} />
        {tab === 0 && <QuantityOffersTab bundles={bundles} submit={submit} />}
        {tab === 1 && <UpsellsTab upsells={upsells} submit={submit} />}
        {tab === 2 && <AbandonedCartTab settings={settings} submit={submit} />}
      </BlockStack>
    </Page>
  );
}

function QuantityOffersTab({ bundles, submit }: { bundles: any[]; submit: any }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [productId, setProductId] = useState("all");
  const [minQuantity, setMinQuantity] = useState("2");
  const [discountType, setDiscountType] = useState("percentage");
  const [discountValue, setDiscountValue] = useState("10");

  const handleCreate = useCallback(() => {
    const data = new FormData();
    data.set("intent", "create-bundle");
    data.set("title", title);
    data.set("productId", productId);
    data.set("minQuantity", minQuantity);
    data.set("discountType", discountType);
    data.set("discountValue", discountValue);
    submit(data, { method: "post" });
    setModalOpen(false);
    setTitle("");
  }, [title, productId, minQuantity, discountType, discountValue, submit]);

  const del = (id: string) => {
    const data = new FormData();
    data.set("intent", "delete-bundle");
    data.set("id", id);
    submit(data, { method: "post" });
  };
  const toggle = (id: string) => {
    const data = new FormData();
    data.set("intent", "toggle-bundle");
    data.set("id", id);
    submit(data, { method: "post" });
  };

  return (
    <BlockStack gap="300">
      <Banner tone="info" title="Sell more per order: quantity breaks built for COD">
        <p>Add quantity breaks that appear directly on the COD form.</p>
      </Banner>
      <Card>
        <BlockStack gap="300">
          <Button onClick={() => setModalOpen(true)}>Add offer</Button>
          {bundles.length === 0 ? (
            <Text as="p" tone="subdued">
              Configure your quantity offers. On this section you can create
              quantity offers for your COD form. The offers will appear
              directly on the form.
            </Text>
          ) : (
            <IndexTable
              resourceName={{ singular: "offer", plural: "offers" }}
              itemCount={bundles.length}
              headings={[
                { title: "Title" },
                { title: "Applies to" },
                { title: "Trigger" },
                { title: "Discount" },
                { title: "Status" },
                { title: "Actions" },
              ]}
              selectable={false}
            >
              {bundles.map((bundle, index) => (
                <IndexTable.Row id={bundle.id} key={bundle.id} position={index}>
                  <IndexTable.Cell>
                    <Text as="span" fontWeight="bold">{bundle.title}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{bundle.productId}</IndexTable.Cell>
                  <IndexTable.Cell>Qty {bundle.minQuantity}+</IndexTable.Cell>
                  <IndexTable.Cell>
                    {bundle.discountType === "percentage"
                      ? `${bundle.discountValue}%`
                      : `$${bundle.discountValue}`}{" "}
                    off
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={bundle.isActive ? "success" : undefined}>
                      {bundle.isActive ? "Active" : "Paused"}
                    </Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Button size="slim" onClick={() => toggle(bundle.id)}>
                      {bundle.isActive ? "Pause" : "Activate"}
                    </Button>{" "}
                    <Button size="slim" tone="critical" onClick={() => del(bundle.id)}>
                      Delete
                    </Button>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
        </BlockStack>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New quantity offer"
        primaryAction={{ content: "Create offer", onAction: handleCreate }}
        secondaryActions={[{ content: "Cancel", onAction: () => setModalOpen(false) }]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField label="Offer title" value={title} onChange={setTitle} autoComplete="off" placeholder="Buy 2 Save 10%" />
            <TextField label="Product ID (or 'all')" value={productId} onChange={setProductId} autoComplete="off" />
            <TextField label="Minimum quantity" type="number" value={minQuantity} onChange={setMinQuantity} autoComplete="off" />
            <FormLayout.Group>
              <Select label="Discount type" options={[{ label: "Percentage", value: "percentage" }, { label: "Fixed amount", value: "fixed" }]} value={discountType} onChange={setDiscountType} />
              <TextField label="Discount value" type="number" value={discountValue} onChange={setDiscountValue} autoComplete="off" />
            </FormLayout.Group>
          </FormLayout>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}

function UpsellsTab({ upsells, submit }: { upsells: any[]; submit: any }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [triggerProductId, setTriggerProductId] = useState("");
  const [offerProductId, setOfferProductId] = useState("");
  const [offerType, setOfferType] = useState("upsell");
  const [discountType, setDiscountType] = useState("percentage");
  const [discountValue, setDiscountValue] = useState("10");

  const handleCreate = useCallback(() => {
    const data = new FormData();
    data.set("intent", "create-upsell");
    data.set("title", title);
    data.set("triggerProductId", triggerProductId);
    data.set("offerProductId", offerProductId);
    data.set("offerType", offerType);
    data.set("discountType", discountType);
    data.set("discountValue", discountValue);
    submit(data, { method: "post" });
    setModalOpen(false);
    setTitle("");
  }, [title, triggerProductId, offerProductId, offerType, discountType, discountValue, submit]);

  const del = (id: string) => {
    const data = new FormData();
    data.set("intent", "delete-upsell");
    data.set("id", id);
    submit(data, { method: "post" });
  };
  const toggle = (id: string) => {
    const data = new FormData();
    data.set("intent", "toggle-upsell");
    data.set("id", id);
    submit(data, { method: "post" });
  };

  return (
    <BlockStack gap="300">
      <Card>
        <BlockStack gap="300">
          <Button onClick={() => setModalOpen(true)}>Add upsell/downsell</Button>
          <Text as="p" tone="subdued">
            Note: the storefront JS renders bundle/quantity tiers (see
            cod-form.js) but doesn't yet render these upsell/downsell offers
            — the CRUD and data model are here; hook the display + accept
            logic into the form the same way bundle tiers work.
          </Text>
          {upsells.length === 0 ? (
            <Text as="p" tone="subdued">No upsell or downsell offers yet.</Text>
          ) : (
            <IndexTable
              resourceName={{ singular: "offer", plural: "offers" }}
              itemCount={upsells.length}
              headings={[
                { title: "Title" },
                { title: "Type" },
                { title: "Trigger product" },
                { title: "Offer product" },
                { title: "Discount" },
                { title: "Status" },
                { title: "Actions" },
              ]}
              selectable={false}
            >
              {upsells.map((u, index) => (
                <IndexTable.Row id={u.id} key={u.id} position={index}>
                  <IndexTable.Cell>{u.title}</IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={u.offerType === "upsell" ? "success" : "warning"}>
                      {u.offerType}
                    </Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{u.triggerProductId}</IndexTable.Cell>
                  <IndexTable.Cell>{u.offerProductId}</IndexTable.Cell>
                  <IndexTable.Cell>
                    {u.discountType === "percentage" ? `${u.discountValue}%` : `$${u.discountValue}`} off
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={u.isActive ? "success" : undefined}>{u.isActive ? "Active" : "Paused"}</Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Button size="slim" onClick={() => toggle(u.id)}>{u.isActive ? "Pause" : "Activate"}</Button>{" "}
                    <Button size="slim" tone="critical" onClick={() => del(u.id)}>Delete</Button>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
        </BlockStack>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New upsell / downsell"
        primaryAction={{ content: "Create", onAction: handleCreate }}
        secondaryActions={[{ content: "Cancel", onAction: () => setModalOpen(false) }]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField label="Title" value={title} onChange={setTitle} autoComplete="off" placeholder="Add a phone case?" />
            <Select label="Type" options={[{ label: "Upsell", value: "upsell" }, { label: "Downsell", value: "downsell" }]} value={offerType} onChange={setOfferType} />
            <TextField label="Trigger product ID" value={triggerProductId} onChange={setTriggerProductId} autoComplete="off" helpText="Shown when this product is in the form" />
            <TextField label="Offer product ID" value={offerProductId} onChange={setOfferProductId} autoComplete="off" helpText="The product being offered" />
            <FormLayout.Group>
              <Select label="Discount type" options={[{ label: "Percentage", value: "percentage" }, { label: "Fixed amount", value: "fixed" }]} value={discountType} onChange={setDiscountType} />
              <TextField label="Discount value" type="number" value={discountValue} onChange={setDiscountValue} autoComplete="off" />
            </FormLayout.Group>
          </FormLayout>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}

function AbandonedCartTab({ settings, submit }: { settings: any; submit: any }) {
  const [enabled, setEnabled] = useState(settings.abandonedCartEnabled);
  const [delayHours, setDelayHours] = useState(String(settings.abandonedCartDelayHours));
  const [message, setMessage] = useState(settings.abandonedCartMessage);

  const handleSave = useCallback(() => {
    const data = new FormData();
    data.set("intent", "save-abandoned-cart");
    data.set("abandonedCartEnabled", String(enabled));
    data.set("abandonedCartDelayHours", delayHours);
    data.set("abandonedCartMessage", message);
    submit(data, { method: "post" });
  }, [enabled, delayHours, message, submit]);

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">Abandoned cart recovery</Text>
        <FormLayout>
          <Checkbox
            label="Send a recovery message when a customer starts the COD form but doesn't submit it"
            checked={enabled}
            onChange={setEnabled}
          />
          <TextField
            label="Send after this many hours"
            type="number"
            value={delayHours}
            onChange={setDelayHours}
            autoComplete="off"
            disabled={!enabled}
          />
          <TextField
            label="Message"
            value={message}
            onChange={setMessage}
            autoComplete="off"
            multiline={3}
            disabled={!enabled}
          />
        </FormLayout>
        <Text as="p" tone="subdued">
          Requires: (1) the storefront JS to ping an endpoint when a customer
          starts filling the form (not just on submit), and (2) a scheduled
          job to find carts past the delay with no submission and send via
          your configured SMS provider. Neither is wired up yet — this tab
          only persists the settings.
        </Text>
      </BlockStack>
    </Card>
  );
}
