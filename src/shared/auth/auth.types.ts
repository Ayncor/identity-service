export type JwtAccessClaims = {
  sub: string; // user_id
  org_id: string;
  membership_id: string;
  role_id?: string | null;
  perms?: string[]; // Flattened permissions array
  jti?: string; // JWT ID for audit correlation
};

export type AuthPrincipal = {
  user_id: string;
  org_id: string;
  membership_id: string;
  role_id?: string | null;
  perms?: string[]; // Flattened permissions array
  jti?: string; // JWT ID for audit correlation
};

