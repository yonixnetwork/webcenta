"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { currentSubscription, disablePush, enablePush, isIos, isStandalone, pushSupported } from "@/lib/push-client";
import { buttonClass } from "./ui/button";

type State = "loading" | "on" | "off" | "denied" | "unsupported" | "ios-install";

/** "Push notifications on this device" switch (Account → Notifications). Test sends are an admin tool (Admin → Push). */
export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // iPhone/iPad only allow web push in an app added to the Home Screen (iOS 16.4+).
    if (isIos() && !isStandalone()) { queueMicrotask(() => setState("ios-install")); return; }
    if (!pushSupported()) { queueMicrotask(() => setState("unsupported")); return; }
    if (Notification.permission === "denied") { queueMicrotask(() => setState("denied")); return; }
    void currentSubscription().then((s) => setState(s && Notification.permission === "granted" ? "on" : "off"));
  }, []);
  if (state === "loading") return null;
  if (state === "ios-install") return (
    <div className="space-y-1 text-sm text-muted" data-testid="push-ios-install">
      <p><strong className="text-text">On iPhone and iPad, notifications only work in the Webcenta app on your Home Screen.</strong></p>
      <ol className="list-decimal space-y-0.5 pl-5">
        <li>In Safari, tap <strong>Share</strong> and choose <strong>Add to Home Screen</strong>.</li>
        <li>Open Webcenta from the new Home Screen icon and sign in.</li>
        <li>Come back here and tap <strong>Turn on notifications</strong>, then allow them.</li>
      </ol>
      <p>Requires iOS or iPadOS 16.4 or later.</p>
    </div>
  );
  if (state === "unsupported") return <p className="text-sm text-muted">This browser cannot receive notifications. Try Chrome, Edge, Firefox or Samsung Internet, or install Webcenta as an app.</p>;
  if (state === "denied") return <p className="text-sm text-muted" data-testid="push-denied">Notifications are blocked for Webcenta in this browser’s or this phone’s settings. Webcenta cannot ask again: allow notifications for this site (or the installed app) in the settings, then reload this page.</p>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className={buttonClass(state === "on" ? "secondary" : "primary", "sm")} onClick={async () => {
          setMsg(null); setBusy(true);
          try {
            if (state === "on") { await disablePush(); setState("off"); return; }
            const r = await enablePush();
            if (r === "on") { setState("on"); setMsg({ ok: true, text: "Notifications are on for this device." }); }
            else if (r === "denied") setState(Notification.permission === "denied" ? "denied" : "off");
            else setMsg({ ok: false, text: "Could not turn on notifications. Please try again." });
          } finally { setBusy(false); }
        }}>
          {state === "on" ? <><BellOff className="mr-1.5 inline size-4" aria-hidden />Turn off notifications on this device</> : <><Bell className="mr-1.5 inline size-4" aria-hidden />Turn on notifications on this device</>}
        </button>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-success" : "text-sm text-danger"}>{msg.text}</p>}
    </div>
  );
}
