/**
 * Runs once when each server process starts. All work happens in the Node.js runtime
 * (instrumentation-node.ts); this exact `if (process.env.NEXT_RUNTIME === "nodejs")`
 * form lets the bundler leave Node-only modules out of the edge bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./instrumentation-node");
    await registerNode();
  }
}
