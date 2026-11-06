# ADR-0004: Authentication — Better Auth for users, separate admin auth

Status: Accepted (implementation in Phase 2/3) · Date: 2026-11-06

## Context
Public users need email+password with verification and reset, plus Google and Apple sign-in.
Administrators must be completely separated from public accounts, invitation-only, with MFA.

## Decision
* **Public users and developers:** Better Auth (self-hosted, Prisma adapter). The `User`,
  `Session`, `Account` and `Verification` tables follow its expected shape.
* **Administrators:** a small dedicated session layer over `AdminUser` and `AdminSession`. It uses
  hashed session tokens, a host-only `__Host-` cookie on `admin.webcenter.com`, and mandatory
  TOTP. Accounts are created only by the provisioning CLI or by invitation.

## Consequences
+ No vendor lock-in or per-user fees; the admin attack surface is independent of public sign-up.
− Two auth code paths to maintain. The admin path is deliberately small and gets a dedicated
  security review.
− Alternatives considered: Auth.js (weaker built-in email+password flows) and hosted identity
  providers such as Clerk or Auth0 (cost per MAU and data residency; could be revisited).
