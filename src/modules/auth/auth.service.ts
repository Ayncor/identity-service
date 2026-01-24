import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { randomUUID } from "crypto";

import { InMemoryStore } from "../storage/storage.store";

const ROLE_IDS = {
  ORG_ADMIN: "11111111-1111-1111-1111-111111111111",
  ORG_MEMBER: "22222222-2222-2222-2222-222222222222"
} as const;

function nowIso(): string {
  return new Date().toISOString();
}

function addMs(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function hashPassword(password: string, salt: string): string {
  const key = scryptSync(password, salt, 64);
  return key.toString("hex");
}

function verifyPassword(password: string, salt: string, expectedHashHex: string): boolean {
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHashHex, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

@Injectable()
export class AuthService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService
  ) {
    // Dev bootstrap: create one user/org if configured.
    this.bootstrapDevIdentity();
  }

  private bootstrapDevIdentity() {
    const email = (this.cfg.get<string>("BOOTSTRAP_EMAIL") ?? "").trim().toLowerCase();
    const password = this.cfg.get<string>("BOOTSTRAP_PASSWORD") ?? "";
    const orgSlug = (this.cfg.get<string>("BOOTSTRAP_ORG_SLUG") ?? "ayncor").trim();
    const orgName = this.cfg.get<string>("BOOTSTRAP_ORG_NAME") ?? "AynCor";

    if (!email || !password) return;
    if (this.store.usersByEmail.has(email)) return;

    const salt = randomBytes(16).toString("hex");
    const user = this.store.createUser({
      email,
      display_name: email.split("@")[0] ?? "admin",
      password_hash: hashPassword(password, salt),
      password_salt: salt
    });

    const org = this.store.orgsBySlug.get(orgSlug) ?? this.store.createOrg({ name: orgName, slug: orgSlug });

    const membership = this.store.createMembership({
      org_id: org.id,
      user_id: user.id,
      role_id: ROLE_IDS.ORG_ADMIN,
      status: "ACTIVE",
      joined_at: nowIso(),
      invited_by_user_id: null
    });

    this.store.appendAudit({
      org_id: org.id,
      actor_user_id: user.id,
      action: "identity.bootstrap.created",
      target_type: "org",
      target_id: org.id,
      metadata_json: { email }
    });

    this.store.appendAudit({
      org_id: org.id,
      actor_user_id: user.id,
      action: "identity.bootstrap.membership.created",
      target_type: "membership",
      target_id: membership.id,
      metadata_json: { email }
    });
  }

  getRoleIds() {
    return ROLE_IDS;
  }

  async login(email: string, password: string, orgSlug: string) {
    const user = this.store.usersByEmail.get(email.toLowerCase());
    if (!user || user.status !== "ACTIVE") throw new UnauthorizedException("Invalid credentials");

    const org = this.store.orgsBySlug.get(orgSlug);
    if (!org || org.status !== "ACTIVE") throw new UnauthorizedException("Invalid credentials");

    const membership = this.store.membershipsByOrgUser.get(`${org.id}:${user.id}`);
    if (!membership || membership.status !== "ACTIVE") throw new UnauthorizedException("Invalid credentials");

    if (!verifyPassword(password, user.password_salt, user.password_hash)) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const accessToken = this.jwt.sign({
      sub: user.id,
      org_id: org.id,
      membership_id: membership.id,
      role_id: membership.role_id ?? null
    });

    const refreshToken = randomUUID();
    const ttlMs = Number(this.cfg.get<string>("JWT_REFRESH_TTL_MS") ?? `${30 * 24 * 60 * 60 * 1000}`);
    this.store.saveRefreshToken({
      token: refreshToken,
      user_id: user.id,
      org_id: org.id,
      membership_id: membership.id,
      revoked_at: null,
      expires_at: addMs(ttlMs),
      created_at: nowIso()
    });

    this.store.appendAudit({
      org_id: org.id,
      actor_user_id: user.id,
      action: "identity.auth.login",
      target_type: "user",
      target_id: user.id,
      metadata_json: {}
    });

    return { access_token: accessToken, refresh_token: refreshToken, user, org, membership };
  }

  async refresh(refreshToken: string) {
    const rt = this.store.refreshTokensByToken.get(refreshToken);
    if (!rt || rt.revoked_at) throw new UnauthorizedException("Invalid refresh token");
    if (new Date(rt.expires_at) < new Date()) throw new UnauthorizedException("Invalid refresh token");

    // rotate refresh token
    rt.revoked_at = nowIso();
    this.store.refreshTokensByToken.set(refreshToken, rt);

    const newRefresh = randomUUID();
    const ttlMs = Number(this.cfg.get<string>("JWT_REFRESH_TTL_MS") ?? `${30 * 24 * 60 * 60 * 1000}`);
    this.store.saveRefreshToken({
      token: newRefresh,
      user_id: rt.user_id,
      org_id: rt.org_id,
      membership_id: rt.membership_id,
      revoked_at: null,
      expires_at: addMs(ttlMs),
      created_at: nowIso()
    });

    const user = this.store.usersById.get(rt.user_id);
    const org = this.store.orgsById.get(rt.org_id);
    const membership = this.store.membershipsById.get(rt.membership_id);
    if (!user || !org || !membership) throw new UnauthorizedException("Invalid refresh token");

    const accessToken = this.jwt.sign({
      sub: user.id,
      org_id: org.id,
      membership_id: membership.id,
      role_id: membership.role_id ?? null
    });

    this.store.appendAudit({
      org_id: org.id,
      actor_user_id: user.id,
      action: "identity.auth.refresh",
      target_type: "user",
      target_id: user.id,
      metadata_json: {}
    });

    return { access_token: accessToken, refresh_token: newRefresh, user, org, membership };
  }

  async logout(refreshToken: string) {
    const rt = this.store.refreshTokensByToken.get(refreshToken);
    if (!rt || rt.revoked_at) throw new UnauthorizedException("Invalid refresh token");
    rt.revoked_at = nowIso();
    this.store.refreshTokensByToken.set(refreshToken, rt);

    this.store.appendAudit({
      org_id: rt.org_id,
      actor_user_id: rt.user_id,
      action: "identity.auth.logout",
      target_type: "user",
      target_id: rt.user_id,
      metadata_json: {}
    });
  }
}

