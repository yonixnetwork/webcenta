"use client";
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

/** Browser client for /api/auth (same origin). */
export const authClient = createAuthClient({
  // Mirrors user.additionalFields in src/server/auth/user-auth.ts.
  plugins: [inferAdditionalFields({ user: { birthDate: { type: "string", required: false } } })],
});
