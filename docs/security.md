# Calibra — Security & Authorization Architecture

## 1. Environment & Credential Management

Calibra strictly distinguishes between public client-side configuration and privileged server-side secrets.

### Variable Classification

| Variable | Scope | Access Layer | Risk Level | Description |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | Public / Frontend | Browser | Low | Supabase project API endpoint. |
| `VITE_SUPABASE_PROJECT_ID` | Public / Frontend | Browser | Low | Project reference identifier. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public / Frontend | Browser | Low | Anon / publishable key with RLS enforcement. |
| `SUPABASE_URL` | Private / Backend | Server only | Medium | Server-side API endpoint for server functions. |
| `SUPABASE_PROJECT_ID` | Private / Backend | Server only | Low | Project reference for server functions. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Privileged Secret** | Server only | **Critical** | Bypasses PostgreSQL Row Level Security for administrative RPC operations (`apply_ops`). **Must never reach the browser.** |

### Credential Protection
- `.env` and `.env.*` are explicitly excluded from Git in [`.gitignore`](file:///d:/FDE-Assessment/.gitignore).
- A sanitized [`.env.example`](file:///d:/FDE-Assessment/.env.example) template is provided with dummy values.
- Client bundles never package `SUPABASE_SERVICE_ROLE_KEY`. It is consumed solely within [`src/integrations/supabase/client.server.ts`](file:///d:/FDE-Assessment/src/integrations/supabase/client.server.ts).

---

## 2. Authorization & The Demo Role Switcher

### The Current Prototype Model
- The header role dropdown allows switching between five operational personas:
  - `Plant Operator` (`OPERATOR`)
  - `Maintenance Engineer` (`MAINTENANCE`)
  - `Quality Engineer` (`QUALITY`)
  - `Production Planner` (`PLANNER`)
  - `OT/IT Administrator` (`ADMIN`)
- **Server Role Enforcement:**  
  When an action is dispatched via [`calibra.functions.ts`](file:///d:/FDE-Assessment/src/lib/calibra.functions.ts), the backend handler in [`actions.server.ts`](file:///d:/FDE-Assessment/src/lib/actions.server.ts) verifies that the action prefix is permitted for the passed role (e.g., `cal.` for Maintenance, `cert.` and `asset.release` for Quality, `adminOnly` for data generation).
- **Security Limitation:**  
  Because user sessions are demo identities picked in the UI without a cryptographically signed JWT or cookie session, **an untrusted user with network access could forge a request payload with `role: "ADMIN"`**.

### Production Hardening Roadmap
To promote Calibra to production:
1. Enable **Supabase Auth** with MFA for manufacturing operators and QA leads.
2. Establish a dedicated `public.user_roles` table managed solely via database migrations and administrative tooling.
3. Validate session JWTs inside TanStack Start server functions using `supabase.auth.getUser()`.
4. Derive the actor's permissions strictly from verified database claims rather than client request bodies.

---

## 3. Database Security & Tamper Resistance

### Append-Only Integrity
PostgreSQL triggers running `prevent_mutation()` protect auditability:
- `audit_records`: Every entity creation, update, and deletion writes before/after JSON diffs.
- `state_history`: Every lifecycle transition (e.g., `ACTIVE` → `QUARANTINED`, `OPEN` → `COMPLETED`) is recorded.
- Any direct `UPDATE` or `DELETE` statement against these tables raises an exception (`APPEND_ONLY: rows cannot be modified or deleted`).

### Transactional Guard (`apply_ops`)
All state-modifying actions execute through PostgreSQL stored procedure `apply_ops`:
- Atomic: Either all updates/inserts succeed, or the entire transaction rolls back.
- Optimistic Concurrency: Updates carry an `expect` payload (e.g., matching previous `updated_at` or `lifecycle_status`). Concurrent conflicting transitions raise `CONCURRENT_MODIFICATION`.
- Restricted Execution: `REVOKE ALL ON FUNCTION public.apply_ops FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.apply_ops TO service_role;` ensures browser clients cannot invoke arbitrary mutations directly.
