# Push notifications — delivery chain, root causes and diagnostics

## In-app notification ≠ device push

* **In-app notification:** a `Notification` row, shown in Account → Notifications. It is always created.
* **Device push:** a Web Push message sent through the browser vendor's push service (FCM for Chrome/Android, Apple for Safari/iOS, Mozilla, Windows) to each **subscription** of that user's browsers. It is shown by Webcenta's service worker.

An admin announcement creates both, for signed-in users who have a subscription. A user without a valid subscription on the phone gets only the in-app notification. That was the symptom reported.

## Chain (and what was wrong at each step)

| # | Step | Finding | Fix |
|---|---|---|---|
| 1–2 | Notification creation and records | Correct | — |
| 3 | Preferences | Correct (announcements, push copies, categories) | — |
| 4–5 | Subscription creation and persistence | **The phone's subscription went stale and was never re-confirmed.** The settings toggle showed "on" from the browser's local subscription even after the server had deleted it (after a 404/410) or after the server key changed. A subscription made before signing in stayed unlinked from the account (so personal notifications found no device), and one made by another account on a shared phone kept that account. | The browser re-confirms its subscription on visits (after sign-in/out, a new endpoint, a key change, otherwise twice a day): `syncPush()`. The server links it to whoever is signed in now, or to no one. A subscription made with an old key is replaced. The service worker handles `pushsubscriptionchange` (re-subscribe + tell the server). |
| 6 | Service worker registration | **Installation could fail entirely** on a weak mobile connection: one failed precache download (`cache.addAll`) aborted the install, and without an installed worker the browser cannot receive push at all. | Precache is best-effort per file; the worker always installs (cache version wc-v5). |
| 7–8 | Push event and display | `showNotification` was called, but a failure was silent. | `showNotification` with tag/renotify/timestamp; on failure a plain fallback notification (browsers revoke subscriptions that receive pushes without a notification); errors are logged in the worker. Proper monochrome **badge** icon (`/icons/badge-96.png`; Android shows the colour icon as a white square). |
| 9–10 | Server delivery | **Messages were sent with normal urgency.** Android holds normal-priority push messages while the phone is idle (Doze) and can delay them for hours, while desktops show them at once — exactly "desktop works, phone doesn't". Announcements beyond the first 100 devices waited for the scheduler, which never ran (see cron-setup.md). | `Urgency: high`, a per-announcement `Topic` (replaces a still-queued copy instead of stacking), TTL 24 h. The admin send works for up to ~10 s immediately; the fixed scheduler continues larger audiences. |
| 11 | Expired subscriptions | Deleted on 404/410 (kept) | Also counted and logged as *expired*. |
| 12 | Failed delivery logs | Only campaign totals | **`PushDelivery` row per attempt**: outcome (ACCEPTED/FAILED/EXPIRED), HTTP status, error category, platform, kind. Per subscription: last status, last error, last failure, last confirmed by the browser. |
| 13 | Permission states | After "Block", the toggle still offered "Turn on" | Denied: a clear explanation of where to allow notifications; Webcenta never re-prompts. The soft prompt appears only after a few page views, snoozes 14 days on "Not now", and stops after two declines. The native prompt only appears from a tap on "Enable". |
| 14 | iOS | iPhone/iPad receive web push only in a Home Screen web app (iOS/iPadOS 16.4+), never in a normal Safari tab | In Safari on iPhone/iPad, Account → Notifications shows step-by-step *Add to Home Screen* instructions instead of a toggle that cannot work. In the installed app the toggle works. Subscriptions record `standalone`. |
| 15 | Android browsers and installed PWA | Chrome, Edge, Firefox and Samsung Internet use the same service worker; an installed PWA shares the browser's subscription | Covered by the fixes above. |

Clicking a notification opens its Webcenta page: it focuses an open tab already on that page, otherwise navigates an open Webcenta tab, otherwise opens a new window. Only Webcenta paths are accepted.

## Test notification (for real phones)

Account → Notifications → **Send a test notification** sends one push to this browser only and shows the push service's actual answer (for example "accepted (HTTP 201)", "subscription expired", "key rejected"). This is the fastest way to check a phone.

## Admin → Push notifications → Delivery report (last 7 days)

In-app notifications created · push attempts · accepted by push services · failed attempts · expired subscriptions removed · signed-in users without push · devices not eligible (failing repeatedly / opted out) · last accepted delivery and last attempt · error categories · results by device type · subscribed devices by type (including iPhone/iPad Home Screen apps) · recent failing devices (type, signed in or not, last error, last success, last confirmation). Endpoints and payloads are never shown.

**"Accepted" means the push service answered HTTP 201.** Webcenta cannot know whether a phone displayed the notification or whether the user saw it. Do Not Disturb/Focus, battery savers, per-app notification settings or a force-stopped browser can all hide an accepted notification. The report never claims delivery to a screen.

Error categories: `expired` (404/410: the subscription no longer exists; removed), `unauthorized` (401/403: VAPID key mismatch; the browser re-subscribes on its next visit), `bad-request`, `payload-too-large`, `rate-limited` (429), `service-error` (5xx), `network`, `other`.

## What could not be verified here

No physical Android phone or iPhone was available in this environment, and headless Chromium cannot obtain a real FCM subscription without Google's push servers. Tests cover the server side with a mock push service (urgency, payload, logging, expiry, categorisation, linking), and the E2E test sends a real announcement and confirms the attempt is recorded and honestly reported as not accepted. To verify on devices after deployment:

1. **Android (Chrome):** open webcenta.com → sign in → Account → Notifications → *Turn on* → allow → *Send a test notification*. Expect "accepted (HTTP 201)" and a notification within seconds, also with the screen off.
2. **iPhone:** Safari → Share → *Add to Home Screen* → open the icon → sign in → Account → Notifications → *Turn on* → allow → *Send a test notification*.
3. Then send an announcement from Admin → Push and check the delivery report: one *accepted* per device.
