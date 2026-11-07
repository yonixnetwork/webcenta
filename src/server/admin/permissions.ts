import type { AdminRole } from "@/generated/prisma/enums";

/** Single reviewed source of admin permissions (docs/SECURITY.md §2.3). */
export const PERMISSIONS = {
  "admins.manage": ["SUPER_ADMIN"],
  "audit.view": ["SUPER_ADMIN", "ADMIN"],
  "settings.manage": ["SUPER_ADMIN", "ADMIN"],
  "catalog.manage": ["SUPER_ADMIN", "ADMIN"],
  "listings.moderate": ["SUPER_ADMIN", "ADMIN", "MODERATOR"],
  "content.moderate": ["SUPER_ADMIN", "ADMIN", "MODERATOR"],
  "developers.verify": ["SUPER_ADMIN", "ADMIN", "MODERATOR"],
  "developers.verifyBusiness": ["SUPER_ADMIN", "ADMIN"],
  "users.suspend": ["SUPER_ADMIN", "ADMIN", "MODERATOR"],
  "users.view": ["SUPER_ADMIN", "ADMIN", "MODERATOR", "SUPPORT_AGENT"],
  "support.manage": ["SUPER_ADMIN", "ADMIN", "MODERATOR", "SUPPORT_AGENT"],
  "security.manage": ["SUPER_ADMIN", "ADMIN", "MODERATOR"],
  "analytics.view": ["SUPER_ADMIN", "ADMIN", "MODERATOR", "ANALYTICS_VIEWER"],
  "monetization.manage": ["SUPER_ADMIN", "ADMIN"],
  "jobs.view": ["SUPER_ADMIN", "ADMIN"],
} as const satisfies Record<string, readonly AdminRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: AdminRole, perm: Permission): boolean {
  return (PERMISSIONS[perm] as readonly AdminRole[]).includes(role);
}

export const ROLE_RANK: Record<AdminRole, number> = { ANALYTICS_VIEWER: 0, SUPPORT_AGENT: 1, MODERATOR: 2, ADMIN: 3, SUPER_ADMIN: 4 };
export const ROLE_LABEL: Record<AdminRole, string> = { SUPER_ADMIN: "Super Administrator", ADMIN: "Administrator", MODERATOR: "Moderator", SUPPORT_AGENT: "Support Agent", ANALYTICS_VIEWER: "Analytics Viewer" };
