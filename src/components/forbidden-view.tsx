import { ShieldX } from "lucide-react";
import { ErrorPage } from "@/components/error-page";

export function ForbiddenView({ standalone = false, admin = false }: { standalone?: boolean; admin?: boolean }) {
  return (
    <ErrorPage code="403" title="Access denied" icon={<ShieldX className="size-8" aria-hidden />} standalone={standalone}
      showSearch={!admin} showCategories={!admin} homeLabel={admin ? "Back to the dashboard" : undefined}>
      {admin ? (
        <p>Your administrator role does not include this area. The attempt was recorded in the audit log. Ask a Super Administrator if you need access.</p>
      ) : (
        <p>You don’t have permission to view this page. If you think you should, ask the owner of your developer organisation to change your role, or contact support.</p>
      )}
    </ErrorPage>
  );
}
