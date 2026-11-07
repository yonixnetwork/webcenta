"use client";
import { createAuthClient } from "better-auth/react";

/** Browser client for /api/auth (same origin). */
export const authClient = createAuthClient();
