export const ROLE_IDS = {
  ORG_ADMIN: "11111111-1111-1111-1111-111111111111",
  ORG_MEMBER: "22222222-2222-2222-2222-222222222222"
} as const;

// Default permissions for system roles (used when Role model doesn't exist yet)
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  [ROLE_IDS.ORG_ADMIN]: [
    "org:read",
    "org:manage_members",
    "org:manage_roles",
    "audit:read",
    "channels:manage",
    "threads:moderate"
  ],
  [ROLE_IDS.ORG_MEMBER]: ["org:read", "channels:read", "threads:read", "threads:write"]
};

