import { SearchX } from "lucide-react";
import { ErrorPage } from "@/components/error-page";

import { getT } from "@/i18n/server";

export async function NotFoundView({ standalone = false }: { standalone?: boolean }) {
  const t = await getT("common");
  return (
    <ErrorPage code="404" title={t("notFound.title")} icon={<SearchX className="size-8" aria-hidden />} standalone={standalone}>
      <p>{t("notFound.body")}</p>
    </ErrorPage>
  );
}
