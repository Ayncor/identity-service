# Ayncor Identity Service — AGENTS.md

This file defines the **non-negotiable engineering rules** for `identity-service`.

If a change violates this document, it must not be merged.

---

# 1. Core Responsibility (DO NOT BREAK)

This service owns ONLY:

- authentication (login, refresh, logout)
- users
- organizations
- memberships
- roles & permissions (RBAC)
- audit logs

This is a **foundational infrastructure service**.

---

# 2. Hard Boundaries

The following must NEVER be added here:

- threads / messages / channels
- inbox logic
- notification logic
- realtime logic
- business workflows from core-service
- UI-specific behavior

If a feature requires domain knowledge → it belongs in core-service.

---

# 3. Architecture Invariants

- Keep controllers thin (controller → service → persistence)
- Keep business rules in services (not in controllers)
- Keep persistence concerns inside Prisma access (don’t spread query details everywhere)
- Validation must happen at boundaries (DTOs / request validation)

Do not collapse layers for convenience.

---

# 4. Contracts (STRICT)

`contracts/` is authoritative.

- No undocumented endpoints or fields
- No silent changes
- No breaking changes without explicit reasoning

If contract changes are required:

1. Explain why existing contract fails
2. Provide alternatives considered
3. Document trade-offs (security, migration, compatibility)
4. Prefer backward-compatible evolution

---

# 5. Security Rules (NON-NEGOTIABLE)

- Never leak user existence
- Never log secrets or tokens
- Always assume hostile input
- Refresh token rotation must remain intact
- JWT perms must be enforced strictly
- Rate limiting must not be bypassed

If unsure → choose the safer option

---

# 6. Data Ownership

- Owns identity DB completely
- Other services reference IDs only
- No cross-service DB access

---

# 7. Logging Rules

- Use the shared logger util (`src/shared/logger/logger.ts`) for operational logs (avoid raw `console.*`)
- Log only high-signal events (startup, auth-critical flows) — avoid noisy per-request logs
- Never log credentials or tokens
- Never log sensitive JWT claims (beyond ids if absolutely required)

---

# 8. Deployment Discipline

Before merge:

- Auth flow must work end-to-end
- Token refresh must work
- No env var breakage

---

# 9. Things That Must Never Happen

- Token issuance logic outside this service
- Weakening auth for convenience
- Silent failures in auth flows
- Cross-service coupling

---

# 10. Philosophy

Security > convenience  
Correctness > speed  
Explicit > implicit

This service must remain boring, predictable, and safe.
