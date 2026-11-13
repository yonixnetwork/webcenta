import { buildId } from "@/server/build-id";

/** The running build's id. Open pages compare it with the id they were rendered with to offer a reload after a deployment. */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ build: buildId() }, { headers: { "Cache-Control": "no-store" } });
}
