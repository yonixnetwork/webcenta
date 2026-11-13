import { describe, expect, it } from "vitest";
import { composeDescription, extractSiteText } from "@/server/importer/enrich";

const page = `<!doctype html><html><head><title>Plannr</title></head><body>
<header><nav><ul><li><a href="/pricing">Pricing</a></li><li><a href="/login">Log in</a></li></ul></nav></header>
<main>
  <h1>Plan projects together</h1>
  <p>Plannr is a shared planning board for small teams that want to see every project, deadline and owner in one place.</p>
  <p>Create boards for each project, assign tasks to teammates and follow progress with timelines and weekly summaries.</p>
  <p>We use cookies to improve your experience. Accept all cookies?</p>
  <ul><li>Drag-and-drop task boards</li><li>Timeline view for every project</li><li>Weekly progress summaries by email</li><li>Guest access for clients</li></ul>
</main>
<footer><p>© 2026 Plannr Inc. All rights reserved.</p></footer>
<script>var x = "<p>not text</p>";</script>
</body></html>`;

describe("description enrichment", () => {
  it("takes the website's own explanatory text and feature list, without navigation, cookie notices or footers", () => {
    const t = extractSiteText(page);
    expect(t.paragraphs).toHaveLength(2);
    expect(t.paragraphs[0]).toMatch(/^Plannr is a shared planning board/);
    expect(t.paragraphs.join(" ")).not.toMatch(/cookies|rights reserved/);
    expect(t.features).toEqual(["Drag-and-drop task boards", "Timeline view for every project", "Weekly progress summaries by email", "Guest access for clients"]);
  });

  it("composes a fuller description only from what the site says, and only when clearly better", () => {
    const site = extractSiteText(page);
    const current = "Plannr is a web app in Productivity. Visit the website for details.";
    const d = composeDescription("Plannr", current, { description: "Plannr – shared project planning for small teams", manifestDescription: null }, site)!;
    expect(d).toContain("Plannr – shared project planning for small teams.");
    expect(d).toContain("Create boards for each project");
    expect(d).toContain("What Plannr's website highlights:\n• Drag-and-drop task boards");
    expect(d.length).toBeGreaterThan(250);
    // No pricing or compatibility claims are added that the page does not make.
    expect(d).not.toMatch(/free|price|iOS|Android/i);
    // A good existing description is not replaced by something barely longer.
    expect(composeDescription("Plannr", d, { description: null, manifestDescription: null }, site)).toBeNull();
    // A site that says almost nothing produces no proposal.
    expect(composeDescription("X", "Short.", { description: null, manifestDescription: null }, { paragraphs: [], features: [] })).toBeNull();
  });
});
