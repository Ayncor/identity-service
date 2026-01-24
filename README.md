# identity-service

Authentication, users, organizations, memberships, RBAC, audit logs.

## Local dev

1) Create a `.env` file:

- Copy `.env.example` → `.env`
- Set `BOOTSTRAP_PASSWORD` and `JWT_ACCESS_SECRET`

Generate `JWT_ACCESS_SECRET` (PowerShell):

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object {Get-Random -Max 256}))
```

2) Install + run:

```powershell
npm install
npm run start:dev
```

3) Login:

- `POST /auth/login` with `email`, `password`, `org_slug` from your `.env`

