import { expect, test, type Page } from "@playwright/test";
import { BASE, closeDb, registerUser, sql } from "./helpers";

/**
 * Ratings & reviews on a fictional fixture listing, end to end through the UI.
 * Moderation by an administrator and developer replies are covered by journeys 4 and 9.
 * Test setup that bypasses the UI is marked "setup:".
 */
test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString(36);
const SLUG = "sample-pixel-dream";
const A = { email: `rev-a-${RUN}@example.test`, name: "Riley Rater" };
const B = { email: `rev-b-${RUN}@example.test`, name: "Morgan Critic" };
let a: Page, b: Page;

async function ageAccount(email: string) {
  // setup: make the account older than the 24-hour "new account" hold so reviews publish directly.
  await sql(`update "User" set "createdAt" = UTC_TIMESTAMP(3) - INTERVAL 3 DAY where email = $1`, [email]);
}
async function rate(page: Page, n: number, body?: string) {
  await page.getByLabel(`${n} star${n > 1 ? "s" : ""}`, { exact: true }).check({ force: true });
  await expect(page.getByTestId("rating-word")).toContainText(`${n}/5`);
  if (body !== undefined) await page.getByLabel("Review (optional)").fill(body);
  await page.getByRole("button", { name: /Publish review|Update review/ }).click();
}
async function expectSummary(page: Page, avg: string, total: string, dist: Record<number, [number, number]>) {
  await page.reload();
  const summary = page.getByTestId("rating-summary");
  await expect(summary.getByTestId("rating-average")).toHaveText(avg);
  await expect(summary.getByTestId("rating-total")).toHaveText(total);
  await expect(summary.getByRole("img", { name: new RegExp(`^${avg.split("/")[0]} out of 5 stars$`) })).toBeVisible();
  for (const star of [5, 4, 3, 2, 1]) {
    const [count, pct] = dist[star] ?? [0, 0];
    const row = summary.getByTestId(`dist-${star}`);
    await expect(row.getByTestId("dist-count"), `${star}★ count`).toHaveText(String(count));
    await expect(row.getByTestId("dist-percent"), `${star}★ percent`).toHaveText(`${pct}%`);
  }
}

test.beforeAll(async ({ browser }) => {
  a = await (await browser.newContext()).newPage();
  b = await (await browser.newContext()).newPage();
});
test.afterAll(async () => { await closeDb(); });

test("empty state is honest: no average, no stars, no fabricated counts", async () => {
  await a.goto(`${BASE}/app/${SLUG}`);
  await expect(a.getByText("No reviews yet. Be the first to review this application.")).toBeVisible();
  await expect(a.getByTestId("rating-summary")).toHaveCount(0);
  const ld = await a.locator('script[type="application/ld+json"]').first().textContent();
  expect(ld).not.toContain("aggregateRating");
  await expect(a.locator("#main").getByRole("link", { name: "Sign in" })).toHaveAttribute("href", /next=\/app\/sample-pixel-dream/);
});

test("a new account's review is held: visible to its author only and not counted", async () => {
  await registerUser(a, A.email, A.name);
  await a.goto(`${BASE}/app/${SLUG}`);
  await expect(a.getByRole("button", { name: "Publish review" })).toBeDisabled(); // a rating is required
  await expect(a.getByTestId("rating-word")).toHaveText("Select 1 to 5 stars");
  await rate(a, 3, "Decent results, though prompts need tuning for detailed scenes.");
  await expect(a.getByText(/will appear after a quick moderation check/)).toBeVisible();
  await a.reload();
  await expect(a.getByText("Visible only to you until moderated")).toBeVisible();
  await expect(a.getByTestId("rating-summary")).toHaveCount(0);
  const anon = await (await a.context().browser()!.newContext()).newPage();
  await anon.goto(`${BASE}/app/${SLUG}`);
  await expect(anon.getByText("No reviews yet. Be the first to review this application.")).toBeVisible();
  await expect(anon.getByText("Decent results")).toHaveCount(0);
  await anon.close();
});

test("each rating value from 1 to 5 is stored and averaged exactly", async () => {
  await ageAccount(A.email);
  await a.goto(`${BASE}/app/${SLUG}`);
  await expect(a.getByRole("heading", { name: "Edit your review" })).toBeVisible();
  for (const n of [1, 2, 3, 4, 5]) {
    await rate(a, n);
    await expect(a.getByText("Thanks! Your review is published.")).toBeVisible();
    await expectSummary(a, `${n}.0/5`, "Based on 1 review", { [n]: [1, 100] });
    const db = (await sql<{ rating: number; status: string }>(`select r.rating, r.status from "Review" r join "User" u on u.id = r."userId" join "Listing" l on l.id = r."listingId" where u.email = $1 and l.slug = $2`, [A.email, SLUG]));
    expect(db).toEqual([{ rating: n, status: "PUBLISHED" }]); // one review per user, updated in place
  }
  await expect(a.getByText("Visible only to you until moderated")).toHaveCount(0);
  // The edit is visible with its date and an "edited" marker.
  await expect(a.locator('[id^="review-"]').first()).toContainText(/edited/);
});

test("two reviewers: average, counts, percentages, cards and structured data agree", async () => {
  await registerUser(b, B.email, B.name);
  await ageAccount(B.email);
  await b.goto(`${BASE}/app/${SLUG}`);
  await rate(b, 4, "Fast generations and a clean interface. Exports could be larger.");
  await expect(b.getByText("Thanks! Your review is published.")).toBeVisible();
  await expectSummary(b, "4.5/5", "Based on 2 reviews", { 5: [1, 50], 4: [1, 50] });
  const reviews = b.locator('[id^="review-"]');
  await expect(reviews).toHaveCount(2);
  await expect(reviews.filter({ hasText: B.name }).getByRole("img", { name: "Rated 4 out of 5 stars" })).toBeVisible();
  await expect(reviews.filter({ hasText: B.name })).toContainText(String(new Date().getFullYear())); // dated
  // Header badge and JSON-LD use the same figures.
  await expect(b.getByText("4.5/5 · 2 reviews")).toBeVisible();
  const ld = JSON.parse((await b.locator('script[type="application/ld+json"]').first().textContent())!);
  expect(ld.aggregateRating).toMatchObject({ "@type": "AggregateRating", ratingValue: 4.5, ratingCount: 2, bestRating: 5, worstRating: 1 });
  // Search card shows the real average and count.
  await b.goto(`${BASE}/search?q=Pixel+Dream`);
  await expect(b.getByRole("link", { name: /Pixel Dream/ }).first()).toContainText("4.5");
  await expect(b.getByRole("link", { name: /Pixel Dream/ }).first()).toContainText("(2");
});

test("duplicate reviews are impossible: a second submission edits the existing one", async () => {
  await b.goto(`${BASE}/app/${SLUG}`);
  await expect(b.getByRole("heading", { name: "Edit your review" })).toBeVisible();
  await expect(b.getByRole("button", { name: "Publish review" })).toHaveCount(0);
  await rate(b, 2, "Changed my mind after the last update broke exports.");
  await expect(b.getByText("Thanks! Your review is published.")).toBeVisible();
  const n = await sql<{ n: string }>(`select count(*) n from "Review" r join "User" u on u.id = r."userId" join "Listing" l on l.id = r."listingId" where u.email = $1 and l.slug = $2`, [B.email, SLUG]);
  expect(Number(n[0]!.n)).toBe(1);
  await expectSummary(b, "3.5/5", "Based on 2 reviews", { 5: [1, 50], 2: [1, 50] });
});

test("helpful votes and reporting a review", async () => {
  await a.goto(`${BASE}/app/${SLUG}`);
  const theirs = a.locator('[id^="review-"]').filter({ hasText: B.name });
  await theirs.getByRole("button", { name: /Helpful \(0\)/ }).click();
  await expect(theirs.getByRole("button", { name: /Helpful \(1\)/ })).toHaveAttribute("aria-pressed", "true");
  // Authors cannot vote on their own review.
  await expect(a.locator('[id^="review-"]').filter({ hasText: A.name }).getByRole("button", { name: /Helpful/ })).toBeDisabled();
  await theirs.getByRole("button", { name: "Report" }).click();
  await theirs.getByLabel("Reason").selectOption("SPAM");
  await theirs.getByRole("button", { name: "Send" }).click();
  await expect(theirs.getByRole("status")).toBeVisible();
  await expect(theirs.getByRole("status")).toHaveText("Thanks, the review has been reported for moderation.");
  const reports = await sql(`select 1 from "Report" r join "User" u on u.id = r."reporterId" where u.email = $1 and r."targetType" = 'REVIEW'`, [A.email]);
  expect(reports.length).toBe(1);
});

test("deleting a review updates the average, counts and distribution", async () => {
  await b.goto(`${BASE}/app/${SLUG}`);
  b.once("dialog", (d) => d.accept());
  await b.locator('[id^="review-"]').filter({ hasText: B.name }).getByRole("button", { name: "Delete" }).click();
  await expect(b.locator('[id^="review-"]').filter({ hasText: B.name })).toHaveCount(0);
  await expectSummary(b, "5.0/5", "Based on 1 review", { 5: [1, 100] });
  await expect(b.getByRole("heading", { name: "Write a review" })).toBeVisible();
});

test("rated cards and the rating summary fit a phone screen", async () => {
  await a.setViewportSize({ width: 390, height: 844 });
  await a.goto(`${BASE}/app/${SLUG}#reviews`);
  await expect(a.getByTestId("rating-summary")).toBeVisible();
  // Regression: screen-reader text on rated cards inside horizontal rails once widened the page.
  for (const path of [`/app/${SLUG}`, "/", "/search?q=Pixel"]) {
    await a.goto(`${BASE}${path}`);
    const overflow = await a.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});
