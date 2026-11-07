import { notFound } from "next/navigation";
import { testRoutesEnabled } from "@/server/test-routes";

export const dynamic = "force-dynamic";

export default function ServerErrorTest() {
  if (!testRoutesEnabled()) notFound();
  throw new Error("Deliberate test error (E2E only)");
}
