import { storage } from "@/server/storage";

/** Serves PUBLIC media for the local storage driver. Private keys are never served here. */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const storageKey = `public/${key.join("/")}`;
  if (!/^public\/[a-z0-9/_-]+\.webp$/.test(storageKey)) return new Response("Not found", { status: 404 });
  const body = await storage().then((s) => s.get(storageKey)).catch(() => null);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body as unknown as BodyInit, {
    headers: {
      "content-type": "image/webp",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    },
  });
}
