export type JwtAccessClaims = {
  sub: string; // user_id
  org_id: string;
  membership_id: string;
  role_id?: string | null;
};

export type AuthPrincipal = {
  user_id: string;
  org_id: string;
  membership_id: string;
  role_id?: string | null;
};

