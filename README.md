# identity-service

Authentication, users, organizations, memberships, RBAC, audit logs.

## Local dev

### 1) Configure environment

- Create `./.env` (copy `.env.example` → `.env` if present)
- Ensure these are set:
  - `BOOTSTRAP_EMAIL`
  - `BOOTSTRAP_PASSWORD`
  - `BOOTSTRAP_ORG_SLUG` (default: `ayncor`)
  - `JWT_ACCESS_SECRET` (must match `core-service` for token validation)
  - `JWT_ACCESS_TTL_SECONDS` (default: `900` = 15 minutes)
  - `JWT_REFRESH_TTL_MS` (default: `2592000000` = 30 days)
  - `DATABASE_URL`

Generate `JWT_ACCESS_SECRET` (PowerShell):

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object {Get-Random -Max 256}))
```

### 2) Start Postgres (Docker)

From this folder:

```powershell
docker compose up -d
```

Default compose settings expose Postgres at `localhost:54321`.

Example `DATABASE_URL` for the included `docker-compose.yml`:

```env
DATABASE_URL="postgresql://identity:identity@localhost:54321/identity?schema=public"
```

### 3) Prisma (migrate + generate)

Prisma ORM v7 uses `prisma.config.ts` for CLI configuration:

```powershell
npm run prisma:migrate
npm run prisma:generate
```

Or manually:

```powershell
npx prisma migrate dev --config prisma.config.ts --name init
npx prisma generate --config prisma.config.ts
```

### 4) Install + run

```powershell
npm install
npm run start:dev
```

Note: The service runs in Node ESM mode. `npm run start:dev` runs `nest build --watch`, patches emitted `dist/**/*.js` imports to include `.js` extensions (required by Node ESM), and restarts the server automatically.

Server runs on **port 3001** by default.

---

## API Documentation

**Postman collection:** `authAPI.postman_collection.json` — import into Postman for all endpoints (Health, Auth, Signup, Me, Organizations, Roles, Members, Invites, Audit). Set `baseUrl` to `http://localhost:3001` for local dev. Canonical spec: `contracts/v1/openapi/identity-service.openapi.yaml`.

---

## API Endpoints

### Health

#### `GET /health`
Liveness check (no auth required).

**Response:**
```json
{
  "status": "ok",
  "ts": "2026-01-26T12:00:00.000Z"
}
```

#### `GET /health/ready`
Readiness check with DB connectivity (no auth required).

**Response:**
```json
{
  "status": "ok",
  "db": "ok",
  "latency_ms": 2,
  "ts": "2026-01-26T12:00:00.000Z"
}
```

---

## JWT Token Structure

All authenticated endpoints require a JWT access token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

### JWT Claims

The JWT token includes the following claims:

- `sub` - User ID (string, required)
- `org_id` - Organization ID (string, required)
- `membership_id` - Membership ID (string, required)
- `role_id` - Role ID (string, optional)
- `perms` - Array of permission strings (string[], optional)
- `jti` - JWT ID for audit correlation (string, optional)

**Example JWT payload:**
```json
{
  "sub": "3012b5ce-e1b6-4720-9bd6-d361334337a1",
  "org_id": "ca6b80e6-1e9b-47fb-a972-7ea736c1c3d8",
  "membership_id": "a7ab9602-d605-49c7-9f1e-e5af7e1dfae4",
  "role_id": "b26f4427-2cd9-4340-9992-fe8f57350dd5",
  "perms": ["org:read", "org:manage_members", "org:manage_roles", "audit:read", "channels:manage", "threads:moderate"],
  "jti": "a52ebfd8-58ea-440e-bb83-0b69b73fe00d"
}
```

All operations are **org-scoped** — users can only access resources within their organization.

---

### Authentication

#### `POST /orgs/signup`
Sign up — create user + org in one step. Optional: invite team members. Returns access + refresh tokens (same shape as login).

**Rate limited:** 5 requests per 60 seconds.

**Request:**
```json
{
  "email": "user@company.com",
  "password": "min 8 chars",
  "display_name": "John Doe",
  "org_name": "Acme Inc",
  "org_slug": "acme",
  "invites": [
    { "email": "teammate@company.com", "role_id": null }
  ]
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `email` | ✓ | Must be unique |
| `password` | ✓ | Min 8 chars |
| `display_name` | ✓ | Username (1–120 chars) |
| `org_name` | ✓ | Team name (3–120 chars) |
| `org_slug` | ✓ | Team URL subdomain: `{org_slug}.ayncor.com`. Pattern: `^[a-z0-9-]+$`, 3–60 chars |
| `invites` | Optional | Array of `{ email, role_id? }`. Can be empty or omitted |

**Response:** Same as `/auth/login` (access_token, refresh_token, user, membership, org). Optionally includes `invites_created` with invite tokens.

**Validation:** `org_slug` must be unique; reserved slugs (www, app, api, admin, etc.) are rejected.

#### `GET /orgs/availability/slug?slug=acme`
Check if team URL (slug) is available for sign-up. Public, no auth.

**Response:**
```json
{
  "available": true
}
```

#### `POST /auth/login`
Login with email, password, and org slug. Returns access + refresh tokens.

**Rate limited:** 5 requests per 60 seconds.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password",
  "org_slug": "ayncor"
}
```

**Response:**
```json
{
  "access_token": "jwt_token",
  "refresh_token": "uuid_token",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "display_name": "User Name"
  },
  "org": {
    "id": "uuid",
    "name": "Organization",
    "slug": "ayncor"
  },
  "membership": {
    "id": "uuid",
    "org_id": "uuid",
    "user_id": "uuid",
    "role_id": "uuid",
    "status": "ACTIVE"
  }
}
```

#### `POST /auth/refresh`
Refresh access token using refresh token. Implements **refresh token rotation** (old token is invalidated, new one issued).

**Rate limited:** 30 requests per 60 seconds.

**Request:**
```json
{
  "refresh_token": "uuid_token"
}
```

**Response:** Same as `/auth/login`.

**Security:** Reuse detection — if a refresh token is used twice, all refresh tokens for that user/org are revoked.

#### `POST /auth/logout`
Invalidate a single refresh token.

**Request:**
```json
{
  "refresh_token": "uuid_token"
}
```

**Response:** `204 No Content`

#### `POST /auth/logout-all`
Invalidate all refresh tokens for the authenticated user in their current org.

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `204 No Content`

#### `POST /auth/password-reset/request`
Request password reset (placeholder — always returns `202 Accepted` to avoid user enumeration).

**Rate limited:** 5 requests per 60 seconds.

**Request:**
```json
{
  "email": "user@example.com",
  "org_slug": "ayncor"
}
```

**Response:** `202 Accepted`

#### `POST /auth/password-reset/confirm`
Confirm password reset (placeholder — returns `501 Not Implemented`).

**Request:**
```json
{
  "token": "reset_token",
  "new_password": "newpassword123"
}
```

**Response:** `501 Not Implemented`

---

### User Profile

#### `GET /me`
Get current user profile (from JWT token).

**Headers:** `Authorization: Bearer <access_token>`

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "display_name": "User Name",
    "status": "ACTIVE"
  },
  "org": {
    "id": "uuid",
    "name": "Organization",
    "slug": "ayncor"
  },
  "membership": {
    "id": "uuid",
    "org_id": "uuid",
    "user_id": "uuid",
    "role_id": "uuid",
    "status": "ACTIVE"
  }
}
```

#### `GET /me/sessions`
List active sessions (devices) for the current user in the current org. Returns non-revoked, non-expired refresh tokens with device/IP metadata. No token value is returned.

**Headers:** `Authorization: Bearer <access_token>`

**Response:**
```json
{
  "sessions": [
    {
      "id": "uuid",
      "user_agent": "Mozilla/5.0 ...",
      "ip_at_issue": "127.0.0.1",
      "last_used_at": "2026-01-26T12:00:00.000Z",
      "last_used_from_ip": "127.0.0.1",
      "created_at": "2026-01-26T12:00:00.000Z",
      "expires_at": "2026-02-25T12:00:00.000Z"
    }
  ]
}
```

#### `DELETE /me/sessions/:sessionId`
Revoke a single session (device) by id. Caller must own the session (user/org from JWT). Returns 204 on success, 404 if session not found or already revoked.

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `204 No Content` on success, `404 Not Found` if session doesn’t exist or is already revoked.

---

### Organizations

#### `POST /orgs`
Create a new organization. Creator becomes `ORG_ADMIN`.

**Headers:** `Authorization: Bearer <access_token>`

**Request:**
```json
{
  "name": "My Organization",
  "slug": "my-org"
}
```

**Response:**
```json
{
  "org": {
    "id": "uuid",
    "name": "My Organization",
    "slug": "my-org",
    "status": "ACTIVE"
  },
  "membership": {
    "id": "uuid",
    "org_id": "uuid",
    "user_id": "uuid",
    "role_id": "uuid",
    "status": "ACTIVE"
  }
}
```

#### `GET /orgs/:orgId`
Get organization details.

**Headers:** `Authorization: Bearer <access_token>`

**Response:**
```json
{
  "id": "uuid",
  "name": "My Organization",
  "slug": "my-org",
  "status": "ACTIVE"
}
```

#### `GET /orgs/:orgId/settings`
Get org settings (org admin only). Returns `allowed_email_domains` and `require_company_email`.

**Headers:** `Authorization: Bearer <access_token>`

**Response:**
```json
{
  "allowed_email_domains": ["company.com"],
  "require_company_email": true
}
```

#### `PATCH /orgs/:orgId/settings`
Update org settings (org admin only). When `allowed_email_domains` is set, only those domains can be invited/added.

**Headers:** `Authorization: Bearer <access_token>`

**Request:**
```json
{
  "allowed_email_domains": ["company.com", "acme.co"],
  "require_company_email": true
}
```

---

### Members

#### `POST /orgs/:orgId/members`
Add a member to an organization (org admin only). Creates user if they don't exist.

**Headers:** `Authorization: Bearer <access_token>`

**Request:**
```json
{
  "email": "newuser@example.com",
  "role_id": "uuid"
}
```

**Response:**
```json
{
  "id": "uuid",
  "org_id": "uuid",
  "user_id": "uuid",
  "role_id": "uuid",
  "status": "INVITED"
}
```

#### `PATCH /orgs/:orgId/members/:memberId`
Update member role or status (org admin only).

**Headers:** `Authorization: Bearer <access_token>`

**Request:**
```json
{
  "role_id": "uuid",
  "status": "ACTIVE"
}
```

**Response:**
```json
{
  "id": "uuid",
  "org_id": "uuid",
  "user_id": "uuid",
  "role_id": "uuid",
  "status": "ACTIVE"
}
```

---

### Invites

#### `POST /orgs/:orgId/invites`
Create an invite (org admin only). Returns invite token (deliver out-of-band).

**Headers:** `Authorization: Bearer <access_token>`

**Request:**
```json
{
  "email": "invitee@example.com",
  "role_id": "uuid"
}
```

**Response:**
```json
{
  "invite": {
    "id": "uuid",
    "org_id": "uuid",
    "email": "invitee@example.com",
    "role_id": "uuid",
    "created_at": "2026-01-26T12:00:00.000Z",
    "expires_at": "2026-02-02T12:00:00.000Z"
  },
  "token": "invite_token_uuid"
}
```

#### `GET /orgs/:orgId/invites`
List all invites for an organization (org admin only).

**Headers:** `Authorization: Bearer <access_token>`

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "org_id": "uuid",
      "email": "invitee@example.com",
      "role_id": "uuid",
      "created_at": "2026-01-26T12:00:00.000Z",
      "expires_at": "2026-02-02T12:00:00.000Z",
      "accepted_at": null,
      "declined_at": null,
      "revoked_at": null
    }
  ]
}
```

#### `POST /orgs/:orgId/invites/revoke`
Revoke an invite (org admin only).

**Headers:** `Authorization: Bearer <access_token>`

**Request:**
```json
{
  "invite_id": "uuid"
}
```

**Response:** `204 No Content`

#### `POST /orgs/:orgId/invites/verify`
Verify an invite token (public, no auth required). Returns invite details.

**Request:**
```json
{
  "token": "invite_token_uuid"
}
```

**Response:**
```json
{
  "org": {
    "id": "uuid",
    "name": "My Organization",
    "slug": "my-org"
  },
  "invite": {
    "id": "uuid",
    "org_id": "uuid",
    "email": "invitee@example.com",
    "role_id": "uuid",
    "created_at": "2026-01-26T12:00:00.000Z",
    "expires_at": "2026-02-02T12:00:00.000Z"
  }
}
```

#### `POST /orgs/:orgId/invites/accept`
Accept an invite (public, no auth required). Creates user account if needed, or validates password for existing user. Returns access + refresh tokens.

**Rate limited:** 5 requests per 60 seconds.

**Request:**
```json
{
  "token": "invite_token_uuid",
  "password": "password123",
  "display_name": "User Name"
}
```

**Response:** Same as `/auth/login`.

#### `POST /orgs/:orgId/invites/decline`
Decline an invite (public, no auth required).

**Request:**
```json
{
  "token": "invite_token_uuid"
}
```

**Response:** `204 No Content`

---

### Audit Logs

#### `GET /orgs/:orgId/audit`
List audit logs for an organization (org members only).

**Headers:** `Authorization: Bearer <access_token>`

**Query params:**
- `page_size` (default: 50, max: 200)
- `cursor` (pagination cursor)

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "org_id": "uuid",
      "actor_user_id": "uuid",
      "action": "identity.auth.login",
      "target_type": "user",
      "target_id": "uuid",
      "metadata_json": {},
      "created_at": "2026-01-26T12:00:00.000Z"
    }
  ],
  "next_cursor": "uuid"
}
```

---

## Security Features

### Refresh Token Rotation
- Each refresh token can only be used **once**
- New refresh token is issued on each refresh
- **Reuse detection**: If a refresh token is reused, all refresh tokens for that user/org are revoked

### Refresh token metadata (device / IP)
- At **issue** (login, refresh, invite accept), the service stores the request’s **User-Agent** and **client IP** on the refresh token.
- When a refresh token is **used** (e.g. on refresh), the service records **last-used time** and **last-used IP** on that token before rotating.
- Stored for audit and session visibility. Use `GET /me/sessions` to list active devices and `DELETE /me/sessions/:sessionId` to revoke one. Client IP is taken from `X-Forwarded-For` or `req.ip` / `socket.remoteAddress`.

### Rate Limiting
- `/auth/login`: 5 requests per 60 seconds
- `/auth/refresh`: 30 requests per 60 seconds
- `/auth/password-reset/request`: 5 requests per 60 seconds
- `/orgs/:orgId/invites/accept`: 5 requests per 60 seconds

### Secret Validation
- `JWT_ACCESS_SECRET` must be at least 32 characters in non-development environments
- Weak secrets (e.g., `dev-only-change-me`) are rejected in production

---

## Testing

### Quick Role Test

To quickly verify that roles and permissions are working correctly, run:

**Windows (PowerShell):**
```powershell
.\test-roles.ps1
```

**macOS / Linux (Bash):**
```bash
chmod +x test-roles.sh   # once, to make executable
./test-roles.sh          # default: http://localhost:3001
./test-roles.sh http://localhost:3001   # optional base URL
```

Both scripts automatically test login, JWT decoding, permissions, and refresh token flow. They require no database access (API only). See the [Roles and Permissions](#roles-and-permissions) section for more details.

### PowerShell Example

```powershell
# Login
$body = @{
  email = "admin@ayncor.local"
  password = "ayncor@123"
  org_slug = "ayncor"
} | ConvertTo-Json

$login = Invoke-RestMethod -Method Post -Uri "http://localhost:3001/auth/login" -ContentType "application/json" -Body $body
$access = $login.access_token
$refresh = $login.refresh_token

# Get profile
Invoke-RestMethod -Uri "http://localhost:3001/me" -Headers @{ Authorization = "Bearer $access" }

# List sessions (devices)
Invoke-RestMethod -Uri "http://localhost:3001/me/sessions" -Headers @{ Authorization = "Bearer $access" }

# Refresh token
$refreshBody = @{ refresh_token = $refresh } | ConvertTo-Json
$newSession = Invoke-RestMethod -Method Post -Uri "http://localhost:3001/auth/refresh" -ContentType "application/json" -Body $refreshBody

# Create org
$orgBody = @{ name = "Test Org"; slug = "test-org" } | ConvertTo-Json
$org = Invoke-RestMethod -Method Post -Uri "http://localhost:3001/orgs" -ContentType "application/json" -Body $orgBody -Headers @{ Authorization = "Bearer $access" }
$orgId = $org.org.id

# Create invite
$inviteBody = @{ email = "newuser@example.com" } | ConvertTo-Json
$invite = Invoke-RestMethod -Method Post -Uri "http://localhost:3001/orgs/$orgId/invites" -ContentType "application/json" -Body $inviteBody -Headers @{ Authorization = "Bearer $access" }
$inviteToken = $invite.token

# Accept invite (public)
$acceptBody = @{ token = $inviteToken; password = "password123"; display_name = "New User" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:3001/orgs/$orgId/invites/accept" -ContentType "application/json" -Body $acceptBody

# List audit logs
Invoke-RestMethod -Uri "http://localhost:3001/orgs/$orgId/audit?page_size=50" -Headers @{ Authorization = "Bearer $access" }
```

---

## Roles and Permissions

The service implements **Role-Based Access Control (RBAC)** with permissions embedded in JWT tokens.

### System Roles

Two system roles are automatically created for each organization:

#### `ORG_ADMIN`
Full administrative access. Permissions:
- `org:read` - View organization details
- `org:manage_members` - Add/remove/update members
- `org:manage_roles` - Create and manage custom roles
- `audit:read` - View audit logs
- `channels:manage` - Create and manage channels
- `threads:moderate` - Moderate threads (change state, archive)

#### `ORG_MEMBER`
Standard member access. Permissions:
- `org:read` - View organization details
- `channels:read` - View channels
- `threads:read` - View threads
- `threads:write` - Create messages and threads

### JWT Permissions

Permissions are included in the JWT `perms` array, allowing services (like `core-service`) to check permissions without database lookups.

**Example JWT payload:**
```json
{
  "sub": "user-uuid",
  "org_id": "org-uuid",
  "membership_id": "membership-uuid",
  "role_id": "role-uuid",
  "perms": ["org:read", "org:manage_members", "channels:manage"],
  "jti": "jwt-uuid"
}
```

### Testing Roles

Use the provided test script to verify roles and permissions:

- **Windows:** `.\test-roles.ps1`
- **macOS / Linux:** `./test-roles.sh` (run `chmod +x test-roles.sh` once if needed)

This script:
- Logs in and decodes the JWT
- Verifies `perms` array is present
- Verifies `jti` is present
- Tests refresh token flow
- Displays all permissions

---

## Architecture Notes

- **Org isolation**: All operations are scoped to the organization from the JWT token
- **Refresh token rotation**: One-time-use refresh tokens with reuse detection
- **Audit logging**: All security-sensitive actions are logged
- **RBAC**: Role-based access control with permissions embedded in JWT tokens
- **Bootstrap user**: Created automatically on first run if `BOOTSTRAP_EMAIL` is set
- **Role model**: Roles are org-scoped and looked up by `(orgId, name)` combination