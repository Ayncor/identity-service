import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";

export type ISODateTime = string;

export type UserStatus = "ACTIVE" | "SUSPENDED" | "DELETED";
export type OrgStatus = "ACTIVE" | "SUSPENDED" | "DELETED";
export type MembershipStatus = "ACTIVE" | "INVITED" | "SUSPENDED" | "LEFT";

export type UserRecord = {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string | null;
  status: UserStatus;
  email_verified_at?: ISODateTime | null;
  password_hash: string;
  password_salt: string;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at?: ISODateTime | null;
};

export type OrgRecord = {
  id: string;
  name: string;
  slug: string;
  status: OrgStatus;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at?: ISODateTime | null;
};

export type MembershipRecord = {
  id: string;
  org_id: string;
  user_id: string;
  role_id?: string | null;
  status: MembershipStatus;
  joined_at?: ISODateTime | null;
  invited_by_user_id?: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
};

export type AuditLogRecord = {
  id: string;
  org_id: string;
  actor_user_id?: string | null;
  action: string;
  target_type: string;
  target_id?: string | null;
  metadata_json: Record<string, unknown>;
  created_at: ISODateTime;
};

export type RefreshTokenRecord = {
  token: string;
  user_id: string;
  org_id: string;
  membership_id: string;
  revoked_at?: ISODateTime | null;
  expires_at: ISODateTime;
  created_at: ISODateTime;
};

function nowIso(): ISODateTime {
  return new Date().toISOString();
}

/**
 * In-memory persistence.
 *
 * This is intentionally a thin abstraction so we can swap to a real DB later
 * without rewriting business logic in controllers.
 */
@Injectable()
export class InMemoryStore {
  readonly usersById = new Map<string, UserRecord>();
  readonly usersByEmail = new Map<string, UserRecord>();

  readonly orgsById = new Map<string, OrgRecord>();
  readonly orgsBySlug = new Map<string, OrgRecord>();

  readonly membershipsById = new Map<string, MembershipRecord>();
  readonly membershipsByOrgUser = new Map<string, MembershipRecord>(); // `${orgId}:${userId}`

  readonly auditLogsByOrg = new Map<string, AuditLogRecord[]>(); // org_id -> list (append-only)

  readonly refreshTokensByToken = new Map<string, RefreshTokenRecord>();

  createUser(params: Omit<UserRecord, "id" | "created_at" | "updated_at" | "status"> & { status?: UserStatus }) {
    const id = randomUUID();
    const t = nowIso();
    const rec: UserRecord = {
      id,
      email: params.email.toLowerCase(),
      display_name: params.display_name,
      avatar_url: params.avatar_url ?? null,
      status: params.status ?? "ACTIVE",
      email_verified_at: params.email_verified_at ?? null,
      password_hash: params.password_hash,
      password_salt: params.password_salt,
      created_at: t,
      updated_at: t,
      deleted_at: null
    };
    this.usersById.set(id, rec);
    this.usersByEmail.set(rec.email, rec);
    return rec;
  }

  createOrg(params: Omit<OrgRecord, "id" | "created_at" | "updated_at" | "status"> & { status?: OrgStatus }) {
    const id = randomUUID();
    const t = nowIso();
    const rec: OrgRecord = {
      id,
      name: params.name,
      slug: params.slug,
      status: params.status ?? "ACTIVE",
      created_at: t,
      updated_at: t,
      deleted_at: null
    };
    this.orgsById.set(id, rec);
    this.orgsBySlug.set(rec.slug, rec);
    return rec;
  }

  createMembership(params: Omit<MembershipRecord, "id" | "created_at" | "updated_at">) {
    const id = randomUUID();
    const t = nowIso();
    const rec: MembershipRecord = {
      id,
      ...params,
      created_at: t,
      updated_at: t
    };
    this.membershipsById.set(id, rec);
    this.membershipsByOrgUser.set(`${rec.org_id}:${rec.user_id}`, rec);
    return rec;
  }

  appendAudit(entry: Omit<AuditLogRecord, "id" | "created_at">) {
    const id = randomUUID();
    const rec: AuditLogRecord = { ...entry, id, created_at: nowIso() };
    const list = this.auditLogsByOrg.get(rec.org_id) ?? [];
    list.push(rec);
    this.auditLogsByOrg.set(rec.org_id, list);
    return rec;
  }

  saveRefreshToken(rec: RefreshTokenRecord) {
    this.refreshTokensByToken.set(rec.token, rec);
    return rec;
  }
}

