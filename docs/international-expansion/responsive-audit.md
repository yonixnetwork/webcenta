# Responsive and PWA audit

## Duplicate header / bottom navigation — findings
- The header, tab bar, footer, PWA manager and cookie notice are rendered in exactly one place (`src/app/(public)/layout.tsx`). Error pages that draw their own header are only used outside that layout. No route renders the layout twice.
- Automated check (`international.spec.ts`): exactly one header and one tab bar after each tab, after Back, after scrolling, in a normal tab and with `display-mode: standalone` emulated (installed app).
- Real overlap found: the install, update and push prompts were fixed at `bottom: 7rem` with no safe-area term, and the cookie notice used its own offset. On iPhones with a home indicator (34 px) and in installed mode the prompt sat on or against the tab bar, which can look like a second bar. Fix: one shared rule (`above-mobile-nav`) = tab bar bottom offset (`max(0.75rem, safe-area)`) + tab bar height + gap; tested at 375 × 812.
- Real bug found while testing: fixed overlays inside the header (which uses `backdrop-filter`) are positioned relative to the header, not the screen. The new language dialog is rendered in a portal (as the account menu already was).
- Long screenshots stitched from a scrolled page repeat sticky and fixed elements. That is a capture artefact, not a second element; the tests above count the elements in the DOM.
- Not reproducible here: the uploaded screenshots were not attached, and webcenta.com is not reachable from this environment. If a duplicate is still visible on a device, a screen recording with the device, browser and whether the app is installed would identify it.

## Viewports
Screenshots for 320 × 568, 360 × 800, 375 × 812, 390 × 844, 430 × 932, 768 × 1024, 1024 × 768, 1280 × 800, 1440 × 900 and 1920 × 1080 are produced by `tests/e2e/responsive-audit.spec.ts` (`RESPONSIVE_AUDIT=1`) and `international.spec.ts` (`INTL_SHOTS=1`, Arabic RTL, install prompt, admin pages). Results are summarised in `test-results.md`.
