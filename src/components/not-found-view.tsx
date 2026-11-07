import { SearchX } from "lucide-react";
import { ErrorPage } from "@/components/error-page";

export function NotFoundView({ standalone = false }: { standalone?: boolean }) {
  return (
    <ErrorPage code="404" title="Page not found" icon={<SearchX className="size-8" aria-hidden />} standalone={standalone}>
      <p>The page you are looking for doesn’t exist or may have moved. Check the address, search Webcenta, or browse a popular category.</p>
    </ErrorPage>
  );
}
