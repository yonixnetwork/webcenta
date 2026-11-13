"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { currentSubscription, disablePush, enablePush, pushSupported } from "@/lib/push-client";
import { buttonClass } from "./ui/button";

/** "Push notifications on this device" switch (Account → Notifications). */
export function PushToggle() {
  const [state, setState] = useState<"loading" | "on" | "off" | "denied" | "unsupported">("loading");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!pushSupported()) { queueMicrotask(() => setState("unsupported")); return; }
    if (Notification.permission === "denied") { queueMicrotask(() => setState("denied")); return; }
    void currentSubscription().then((s) => setState(s ? "on" : "off"));
  }, []);
  if (state === "loading") return null;
  if (state === "unsupported") return <p className="text-sm text-muted">This browser cannot receive notifications. On iPhone or iPad, first add Webcenta to your Home Screen (Share → Add to Home Screen), then open it from there.</p>;
  if (state === "denied") return <p className="text-sm text-muted">Notifications are blocked for Webcenta in this browser’s settings. Allow them there to turn them on.</p>;
  return (
    <div className="space-y-2">
      <button type="button" className={buttonClass(state === "on" ? "secondary" : "primary", "sm")} onClick={async () => {
        setMsg("");
        if (state === "on") { await disablePush(); setState("off"); return; }
        const r = await enablePush();
        if (r === "on") setState("on");
        else if (r === "denied") setState("denied");
        else setMsg("Could not turn on notifications. Please try again.");
      }}>
        {state === "on" ? <><BellOff className="mr-1.5 inline size-4" aria-hidden />Turn off notifications on this device</> : <><Bell className="mr-1.5 inline size-4" aria-hidden />Turn on notifications on this device</>}
      </button>
      {msg && <p role="alert" className="text-sm text-danger">{msg}</p>}
    </div>
  );
}
