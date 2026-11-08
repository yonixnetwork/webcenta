/**
 * Test-only routes exist so E2E can exercise error boundaries. They are enabled
 * only when ENABLE_TEST_ERROR_ROUTES=true AND the public origin is localhost,
 * so a misconfigured production deploy still returns 404 for them.
 */
export function testRoutesEnabled(): boolean {
  if (process.env.ENABLE_TEST_ERROR_ROUTES !== "true") return false;
  try {
    const host = new URL(process.env.PUBLIC_ORIGIN ?? "").hostname;
    return host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1";
  } catch {
    return false;
  }
}
