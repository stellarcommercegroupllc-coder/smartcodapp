import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigate } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Banner,
  Box,
  ProgressBar,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// The block handle here must match the filename under
// extensions/smart-cod/blocks/ (smart-cod.liquid -> "smart-cod"). Shopify
// namespaces app embed block types in settings_data.json roughly as
// "shopify://apps/<app-handle>/blocks/<block-handle>/<extension-uuid>",
// so we detect our embed by checking the type string contains our block
// handle, rather than requiring an exact match on the full UUID.
const APP_EMBED_BLOCK_HANDLE = "smart-cod";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const settings = await prisma.shopSettings.upsert({
    where: { shop: session.shop },
    update: {},
    create: { shop: session.shop },
  });

  const embedDetected = await detectAppEmbed(admin);

  return json({
    settings,
    embedDetected,
    shop: session.shop,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "complete" || intent === "skip") {
    await prisma.shopSettings.update({
      where: { shop: session.shop },
      data: { onboardingCompleted: true },
    });
  }

  return json({ ok: true });
};

async function detectAppEmbed(admin: any): Promise<boolean> {
  try {
    const themeRes = await admin.graphql(
      `#graphql
        query MainTheme {
          themes(first: 1, roles: [MAIN]) {
            nodes { id }
          }
        }
      `,
    );
    const themeData = await themeRes.json();
    const themeId = themeData?.data?.themes?.nodes?.[0]?.id;
    if (!themeId) return false;

    const fileRes = await admin.graphql(
      `#graphql
        query SettingsData($id: ID!) {
          theme(id: $id) {
            files(filenames: ["config/settings_data.json"], first: 1) {
              nodes {
                body {
                  ... on OnlineStoreThemeFileBodyText { content }
                }
              }
            }
          }
        }
      `,
      { variables: { id: themeId } },
    );
    const fileData = await fileRes.json();
    const raw = fileData?.data?.theme?.files?.nodes?.[0]?.body?.content;
    if (!raw) return false;

    // settings_data.json can contain /* */ comments, which breaks JSON.parse
    const cleaned = raw.replace(/\/\*[\s\S]*?\*\//g, "");
    const parsed = JSON.parse(cleaned);
    const blocks = parsed?.current?.blocks ?? {};

    return Object.values(blocks).some((block: any) => {
      const type = block?.type ?? "";
      return (
        typeof type === "string" &&
        type.includes(`/blocks/${APP_EMBED_BLOCK_HANDLE}/`) &&
        block?.disabled !== true
      );
    });
  } catch (err) {
    // If theme scopes aren't granted yet, or the query shape changes across
    // API versions, fail closed (treat as "not detected") rather than crash
    // the onboarding page.
    console.error("App embed detection failed:", err);
    return false;
  }
}

export default function Onboarding() {
  const { settings, embedDetected, shop } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigate = useNavigate();
  const [step] = useState(1);

  const themeEditorUrl = `https://${shop}/admin/themes/current/editor?context=apps`;

  const handleContinue = useCallback(() => {
    if (step === 1 && !embedDetected) return;
    // Steps 2 & 3 (form design, test order) would extend this wizard —
    // stubbed here since only step 1 is scoped for now.
    const data = new FormData();
    data.set("intent", "complete");
    submit(data, { method: "post" });
    navigate("/app");
  }, [step, embedDetected, submit, navigate]);

  const handleSkip = useCallback(() => {
    const data = new FormData();
    data.set("intent", "skip");
    submit(data, { method: "post" });
    navigate("/app");
  }, [submit, navigate]);

  return (
    <Page>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="span" tone="subdued" variant="bodySm">
            STEP {step} OF 3 · ACTIVATE THE APP
          </Text>
          <Button
            variant="primary"
            disabled={!embedDetected}
            onClick={handleContinue}
          >
            Continue
          </Button>
        </InlineStack>

        <ProgressBar progress={(step / 3) * 100} size="small" />

        <Box paddingBlockStart="400">
          <BlockStack gap="200" inlineAlign="center">
            <Text as="h1" variant="headingLg" alignment="center">
              Welcome to Smart COD, {shop.replace(".myshopify.com", "")}
            </Text>
            <Text as="p" tone="subdued" alignment="center">
              First, turn on the app in your Shopify theme, takes 30 seconds.
              Then we'll set up your form together.
            </Text>
          </BlockStack>
        </Box>

        <InlineStack gap="400" align="start" wrap={false}>
          <Box width="55%">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingSm" tone="subdued">
                  3 QUICK STEPS
                </Text>
                <BlockStack gap="300">
                  <InlineStack gap="300" blockAlign="start" wrap={false}>
                    <StepNumber n={1} />
                    <Text as="p">
                      Click <b>Open theme editor</b>. Shopify opens in a new tab.
                    </Text>
                  </InlineStack>
                  <InlineStack gap="300" blockAlign="start" wrap={false}>
                    <StepNumber n={2} />
                    <Text as="p">
                      Find <b>Smart COD</b> under <b>App embeds</b> and
                      toggle it on.
                    </Text>
                  </InlineStack>
                  <InlineStack gap="300" blockAlign="start" wrap={false}>
                    <StepNumber n={3} />
                    <Text as="p">
                      Click <b>Save</b> in Shopify, then come back here. We'll
                      detect it automatically.
                    </Text>
                  </InlineStack>
                </BlockStack>

                <Box>
                  <Button
                    url={themeEditorUrl}
                    target="_blank"
                    icon={undefined}
                  >
                    Open theme editor
                  </Button>
                </Box>

                {embedDetected ? (
                  <Banner tone="success">Embed detected, you're all set.</Banner>
                ) : (
                  <Banner tone="info">
                    Waiting for the embed to be turned on — this page checks
                    automatically each time it loads.
                  </Banner>
                )}
              </BlockStack>
            </Card>
          </Box>

          <Box width="45%">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingSm" tone="subdued">
                  WHAT YOU'LL SEE
                </Text>
                <Box
                  padding="300"
                  borderWidth="025"
                  borderColor="border"
                  borderRadius="200"
                >
                  <BlockStack gap="200">
                    <Text as="span" tone="subdued" variant="bodySm">
                      App embeds
                    </Text>
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="span">🛍️</Text>
                        <Text as="span" fontWeight="semibold">
                          Smart COD
                        </Text>
                      </InlineStack>
                      <Text as="span">{embedDetected ? "On" : "Off"}</Text>
                    </InlineStack>
                  </BlockStack>
                </Box>
                <Text as="p" tone="subdued" variant="bodySm">
                  Toggle the switch on, then save the theme.
                </Text>
              </BlockStack>
            </Card>
          </Box>
        </InlineStack>

        <InlineStack align="end">
          <Button variant="plain" onClick={handleSkip}>
            Skip setup
          </Button>
        </InlineStack>
      </BlockStack>
    </Page>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <Box
      background="bg-fill-brand"
      borderRadius="full"
      minWidth="24px"
      minHeight="24px"
    >
      <InlineStack align="center" blockAlign="center">
        <Text as="span" tone="text-inverse" variant="bodySm" fontWeight="bold">
          {n}
        </Text>
      </InlineStack>
    </Box>
  );
}
