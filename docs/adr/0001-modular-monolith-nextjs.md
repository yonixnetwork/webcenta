# ADR-0001: Modular monolith on Next.js

Status: Accepted (Phase 0) · Date: 2026-11-06

## Context
The first host is Hostinger managed Node.js hosting: a single Node process, with no Docker, Redis,
permanent workers or inbound WebSockets. The product needs strong SEO, four hostnames (public,
admin, developers, API), and a small team.

## Decision
Build one **Next.js 16 (App Router) TypeScript** application. Route groups serve each hostname,
selected by middleware from the `Host` header. Domain logic lives in `src/server/<module>`
services that do not depend on React or Next.js.

## Consequences
+ One deployment, one codebase and one language; SSR/ISR for SEO; runs on any Node host.
+ Modules can later be split into separate deployments (e.g. admin), or separate services (e.g.
  the scanner), without rewriting callers.
− Admin and public share a process at first. This is mitigated by separate auth tables and
  cookies, host checks and server-side RBAC; the admin can move to a separate deployment later.
− Alternatives rejected for now: NestJS plus a separate SPA (two deployments; worse SEO
  ergonomics) and Remix or SvelteKit (smaller ecosystem for the needed UI primitives).
