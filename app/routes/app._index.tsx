import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineGrid,
  Badge,
  IndexTable,
  EmptyState,
  Banner,
  Link,
  Select,
  InlineStack,
} from "@shopify/polaris";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const RANGE_OPTIONS = [
  { label: "Last 7 days", value: "7" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const rangeDays = Number(url.searchParams.get("range") || "30");

  const settings = await prisma.shopSettings.upsert({
    where: { shop },
    update: {},
    create: { shop },
  });

  const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

  const [total, converted, pending, submissions, rangeSubmissions] = await Promise.all([
    prisma.codSubmission.count({ where: { shopSettingsId: settings.id } }),
    prisma.codSubmission.count({
      where: { shopSettingsId: settings.id, status: "converted" },
    }),
    prisma.codSubmission.count({
      where: { shopSettingsId: settings.id, status: "pending" },
    }),
    prisma.codSubmission.findMany({
      where: { shopSettingsId: settings.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.codSubmission.findMany({
      where: { shopSettingsId: settings.id, createdAt: { gte: since } },
    }),
  ]);

  const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0;
  const totalRevenue = await prisma.codSubmission.aggregate({
    where: { shopSettingsId: settings.id, status: "converted" },
    _sum: { total: true },
  });

  // --- Daily series for the charts ---
  const dayBuckets = new Map<string, { opens: number; orders: number; revenue: number }>();
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    dayBuckets.set(d.toISOString().slice(0, 10), { opens: 0, orders: 0, revenue: 0 });
  }
  for (const s of rangeSubmissions) {
    const key = s.createdAt.toISOString().slice(0, 10);
    const bucket = dayBuckets.get(key);
    if (!bucket) continue;
    bucket.opens += 1;
    if (s.status === "converted") {
      bucket.orders += 1;
      bucket.revenue += s.total;
    }
  }
  const series = Array.from(dayBuckets.entries()).map(([date, v]) => ({
    date: date.slice(5), // MM-DD
    ...v,
  }));

  // --- Performance by country ---
  const byCountry = new Map<string, { opens: number; orders: number; revenue: number }>();
  for (const s of rangeSubmissions) {
    const row = byCountry.get(s.country) ?? { opens: 0, orders: 0, revenue: 0 };
    row.opens += 1;
    if (s.status === "converted") {
      row.orders += 1;
      row.revenue += s.total;
    }
    byCountry.set(s.country, row);
  }
  const countryRows = Array.from(byCountry.entries()).map(([country, v]) => ({
    country,
    ...v,
    cr: v.opens > 0 ? Math.round((v.orders / v.opens) * 1000) / 10 : 0,
  }));

  // --- Performance by campaign (utm_source / utm_medium / utm_campaign) ---
  const byCampaign = new Map<string, { opens: number; orders: number; revenue: number }>();
  for (const s of rangeSubmissions) {
    const key = [s.utmSource, s.utmMedium, s.utmCampaign].filter(Boolean).join(" / ") || "(direct)";
    const row = byCampaign.get(key) ?? { opens: 0, orders: 0, revenue: 0 };
    row.opens += 1;
    if (s.status === "converted") {
      row.orders += 1;
      row.revenue += s.total;
    }
    byCampaign.set(key, row);
  }
  const campaignRows = Array.from(byCampaign.entries())
    .map(([campaign, v]) => ({
      campaign,
      ...v,
      cr: v.opens > 0 ? Math.round((v.orders / v.opens) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.opens - a.opens);

  return json({
    settings,
    total,
    converted,
    pending,
    conversionRate,
    submissions,
    series,
    countryRows,
    campaignRows,
    rangeDays,
    totalRevenue: totalRevenue._sum.total ?? 0,
  });
};

const statusTone: Record<string, "success" | "warning" | "critical" | undefined> = {
  converted: "success",
  delivered: "success",
  pending: "warning",
  verified: "warning",
  out_for_delivery: "warning",
  failed: "critical",
  abandoned: "critical",
  returned: "critical",
  blocked: "critical",
};

export default function Analytics() {
  const {
    settings,
    total,
    converted,
    pending,
    conversionRate,
    submissions,
    series,
    countryRows,
    campaignRows,
    rangeDays,
    totalRevenue,
  } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  return (
    <Page title="Analytics">
      <Layout>
        {!settings.onboardingCompleted && (
          <Layout.Section>
            <Banner tone="warning" title="Finish activating your app">
              <p>
                Your COD form isn't live on your storefront yet.{" "}
                <Link url="/app/onboarding">Finish setup</Link>
              </p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <InlineStack align="end">
            <div style={{ minWidth: 180 }}>
              <Select
                label="Date range"
                labelHidden
                options={RANGE_OPTIONS}
                value={String(rangeDays)}
                onChange={(v) => setSearchParams({ range: v })}
              />
            </div>
          </InlineStack>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={4} gap="400">
            <Card>
              <BlockStack gap="200">
                <Text as="span" tone="subdued">Form Opens</Text>
                <Text as="h2" variant="heading2xl">{total}</Text>
                <MiniChart data={series} dataKey="opens" color="#5c6ac4" />
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text as="span" tone="subdued">Orders</Text>
                <Text as="h2" variant="heading2xl">{converted}</Text>
                <MiniChart data={series} dataKey="orders" color="#008060" />
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text as="span" tone="subdued">Revenue</Text>
                <Text as="h2" variant="heading2xl">${totalRevenue.toFixed(0)}</Text>
                <MiniChart data={series} dataKey="revenue" color="#bf5af2" />
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text as="span" tone="subdued">Conversion rate</Text>
                <Text as="h2" variant="heading2xl">{conversionRate}%</Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Performance by country</Text>
              {countryRows.length === 0 ? (
                <Text as="p" tone="subdued">No data in this range yet.</Text>
              ) : (
                <IndexTable
                  resourceName={{ singular: "country", plural: "countries" }}
                  itemCount={countryRows.length}
                  headings={[{ title: "Country" }, { title: "Form Opens" }, { title: "Orders" }, { title: "CR" }, { title: "Revenue" }]}
                  selectable={false}
                >
                  {countryRows.map((row, i) => (
                    <IndexTable.Row id={row.country} key={row.country} position={i}>
                      <IndexTable.Cell>{row.country}</IndexTable.Cell>
                      <IndexTable.Cell>{row.opens}</IndexTable.Cell>
                      <IndexTable.Cell>{row.orders}</IndexTable.Cell>
                      <IndexTable.Cell>{row.cr}%</IndexTable.Cell>
                      <IndexTable.Cell>${row.revenue.toFixed(2)}</IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">Performance by campaign</Text>
                <Badge tone="info">from UTM parameters</Badge>
              </InlineStack>
              {campaignRows.length === 0 ? (
                <Text as="p" tone="subdued">No data in this range yet.</Text>
              ) : (
                <IndexTable
                  resourceName={{ singular: "campaign", plural: "campaigns" }}
                  itemCount={campaignRows.length}
                  headings={[{ title: "Campaign" }, { title: "Form Opens" }, { title: "Orders" }, { title: "CR" }, { title: "Revenue" }]}
                  selectable={false}
                >
                  {campaignRows.map((row, i) => (
                    <IndexTable.Row id={row.campaign} key={row.campaign} position={i}>
                      <IndexTable.Cell>{row.campaign}</IndexTable.Cell>
                      <IndexTable.Cell>{row.opens}</IndexTable.Cell>
                      <IndexTable.Cell>{row.orders}</IndexTable.Cell>
                      <IndexTable.Cell>{row.cr}%</IndexTable.Cell>
                      <IndexTable.Cell>${row.revenue.toFixed(2)}</IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            {submissions.length === 0 ? (
              <EmptyState
                heading="No COD form submissions yet"
                image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
              >
                <p>Once customers submit the COD form, their orders show up here.</p>
              </EmptyState>
            ) : (
              <IndexTable
                resourceName={{ singular: "submission", plural: "submissions" }}
                itemCount={submissions.length}
                headings={[
                  { title: "Customer" },
                  { title: "Phone" },
                  { title: "Location" },
                  { title: "Total" },
                  { title: "Status" },
                  { title: "Submitted" },
                ]}
                selectable={false}
              >
                {submissions.map((s, index) => (
                  <IndexTable.Row id={s.id} key={s.id} position={index}>
                    <IndexTable.Cell>
                      <Text as="span" fontWeight="bold">{s.customerName}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{s.phone}</IndexTable.Cell>
                    <IndexTable.Cell>{s.city}, {s.country}</IndexTable.Cell>
                    <IndexTable.Cell>${s.total.toFixed(2)}</IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone={statusTone[s.status]}>{s.status}</Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{new Date(s.createdAt).toLocaleString()}</IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function MiniChart({ data, dataKey, color }: { data: any[]; dataKey: string; color: string }) {
  return (
    <div style={{ height: 60 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
          <Tooltip
            formatter={(value: number) => [value, dataKey]}
            labelFormatter={(label) => label}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
