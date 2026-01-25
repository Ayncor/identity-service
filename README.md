# identity-service

Authentication, users, organizations, memberships, RBAC, audit logs.

## Local dev

### 1) Configure environment

- Create `./.env` (copy `.env.example` → `.env` if present)
- Ensure these are set:
  - `BOOTSTRAP_EMAIL`
  - `BOOTSTRAP_PASSWORD`
  - `BOOTSTRAP_ORG_SLUG`
  - `JWT_ACCESS_SECRET`
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
npx prisma migrate dev --config prisma.config.ts --name init
npx prisma generate --config prisma.config.ts
```

### 4) Install + run

```powershell
npm install
npm run start:dev
```

Note: The service runs in Node ESM mode. `npm run start:dev` runs `nest build --watch`, patches emitted `dist/**/*.js` imports to include `.js` extensions (required by Node ESM), and restarts the server automatically.

### 5) Login (PowerShell)

Run:

```powershell
$body = @{
  email = "admin@ayncor.local"
  password = "ayncor@123"
  org_slug = "ayncor"
} | ConvertTo-Json

$login = Invoke-RestMethod -Method Post -Uri "http://localhost:3001/auth/login" -ContentType "application/json" -Body $body
$access = $login.access_token

Invoke-RestMethod -Uri "http://localhost:3001/me" -Headers @{ Authorization = "Bearer $access" }
```

