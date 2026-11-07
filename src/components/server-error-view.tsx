"use client";

import { useEffect, useState } from "react";
import { RotateCw, ServerCrash, WifiOff } from "lucide-react";
import { ErrorPage } from "@/components/error-page";
import { buttonClass } from "@/components/ui/button";

/**
 * 500 view for error boundaries. If the browser is offline the problem is the
 * connection, not the server, so it says so instead of blaming Webcenta.
 */
export function ServerErrorView({ digest, reset, standalone = false, admin = false }: { digest?: string; reset?: () => void; standalone?: boolean; admin?: boolean }) {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  const retry = () => (reset ? reset() : window.location.reload());
  const actions = (
    <button type="button" onClick={retry} className={buttonClass("primary", "md")}><RotateCw className="size-4" aria-hidden /> Try again</button>
  );
  if (offline) {
    return (
      <ErrorPage code="offline" title="You're currently offline." icon={<WifiOff className="size-8" aria-hidden />} actions={actions} showSearch={false} showCategories={false} standalone={standalone}>
        <p>Please check your internet connection and try again.</p>
      </ErrorPage>
    );
  }
  return (
    <ErrorPage code="500" title="Something went wrong on our side" icon={<ServerCrash className="size-8" aria-hidden />} actions={actions} standalone={standalone}
      showSearch={!admin} showCategories={!admin} homeLabel={admin ? "Back to the dashboard" : undefined}>
      <p>An unexpected error stopped this page from loading. It has been logged. Please try again in a moment.</p>
      {digest && <p className="text-xs text-subtle">Reference: <code>{digest}</code></p>}
    </ErrorPage>
  );
}
