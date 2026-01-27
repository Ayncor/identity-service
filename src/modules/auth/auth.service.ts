import { Injectable, OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";

import { PrismaService } from "../storage/prisma.service";
import { ROLE_IDS, DEFAULT_ROLE_PERMISSIONS } from "../storage/storage.types";

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
export class AuthService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService
  ) {
  }

  async onModuleInit() {
    await this.bootstrapDevIdentity();
  }

  private tokenHash(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  private async revokeAllRefreshTokensForUserOrg(userId: string, orgId: string, reason: string) {
    const revokedAt = new Date();
    const res = await this.prisma.refreshToken.updateMany({
      where: { userId, orgId, revokedAt: null },
      data: { revokedAt }
    });

    await this.prisma.auditLog.create({
      data: {
        orgId,
        actorUserId: userId,
        action: "identity.auth.tokens.revoked_all",
        targetType: "user",
        targetId: userId,
        metadata: { reason, count: res.count }
      }
    });

    return res.count;
  }

  private async bootstrapDevIdentity() {
    const email = (this.cfg.get<string>("BOOTSTRAP_EMAIL") ?? "").trim().toLowerCase();
    const password = this.cfg.get<string>("BOOTSTRAP_PASSWORD") ?? "";
    const orgSlug = (this.cfg.get<string>("BOOTSTRAP_ORG_SLUG") ?? "ayncor").trim();
    const orgName = this.cfg.get<string>("BOOTSTRAP_ORG_NAME") ?? "AynCor";

    if (!email || !password) return;

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) return;

    const salt = randomBytes(16).toString("hex");
    const user = await this.prisma.user.create({
      data: {
        email,
        displayName: email.split("@")[0] ?? "admin",
        passwordHash: hashPassword(password, salt),
        passwordSalt: salt
      }
    });

    const org =
      (await this.prisma.organization.findUnique({ where: { slug: orgSlug } })) ??
      (await this.prisma.organization.create({ data: { name: orgName, slug: orgSlug } }));

    // Ensure system roles exist (look up by orgId + name since roles are org-scoped)
    let adminRole = await this.prisma.role.findUnique({
      where: { orgId_name: { orgId: org.id, name: "ORG_ADMIN" } }
    });
    if (!adminRole) {
      adminRole = await this.prisma.role.create({
        data: {
          orgId: org.id,
          name: "ORG_ADMIN",
          permissions: DEFAULT_ROLE_PERMISSIONS[ROLE_IDS.ORG_ADMIN],
          isSystem: true
        }
      });
    }

    let memberRole = await this.prisma.role.findUnique({
      where: { orgId_name: { orgId: org.id, name: "ORG_MEMBER" } }
    });
    if (!memberRole) {
      memberRole = await this.prisma.role.create({
        data: {
          orgId: org.id,
          name: "ORG_MEMBER",
          permissions: DEFAULT_ROLE_PERMISSIONS[ROLE_IDS.ORG_MEMBER],
          isSystem: true
        }
      });
    }

    const membership = await this.prisma.membership.create({
      data: {
        orgId: org.id,
        userId: user.id,
        roleId: adminRole.id,
        status: "ACTIVE",
        joinedAt: new Date()
      }
    });

    await this.prisma.auditLog.createMany({
      data: [
        {
          orgId: org.id,
          actorUserId: user.id,
          action: "identity.bootstrap.created",
          targetType: "org",
          targetId: org.id,
          metadata: { email }
        },
        {
          orgId: org.id,
          actorUserId: user.id,
          action: "identity.bootstrap.membership.created",
          targetType: "membership",
          targetId: membership.id,
          metadata: { email }
        }
      ]
    });
  }

  getRoleIds() {
    return ROLE_IDS;
  }

  async login(
    email: string,
    password: string,
    orgSlug: string,
    metadata?: { userAgent?: string | null; ip?: string | null }
  ) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || user.status !== "ACTIVE") throw new UnauthorizedException("Invalid credentials");

    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!org || org.status !== "ACTIVE") throw new UnauthorizedException("Invalid credentials");

    const membership = await this.prisma.membership.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: user.id } }
    });
    if (!membership || membership.status !== "ACTIVE") throw new UnauthorizedException("Invalid credentials");

    if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const session = await this.issueSessionForMembership(user.id, org.id, membership.id, "identity.auth.login", metadata);
    return { ...session, user, org, membership };
  }

  private async resolvePermissions(roleId: string | null): Promise<string[]> {
    if (!roleId) return [];
    // Try to load from Role model
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (role) return role.permissions;
    // Fallback to default permissions for system roles
    return DEFAULT_ROLE_PERMISSIONS[roleId] ?? [];
  }

  async issueSessionForMembership(
    userId: string,
    orgId: string,
    membershipId: string,
    auditAction?: string,
    metadata?: { userAgent?: string | null; ip?: string | null }
  ) {
    const membership = await this.prisma.membership.findUnique({ where: { id: membershipId } });
    if (!membership || membership.userId !== userId || membership.orgId !== orgId) {
      throw new UnauthorizedException("Invalid session");
    }

    const permissions = await this.resolvePermissions(membership.roleId);
    const jti = randomUUID(); // JWT ID for audit correlation

    const accessToken = this.jwt.sign({
      sub: userId,
      org_id: orgId,
      membership_id: membershipId,
      role_id: membership.roleId ?? null,
      perms: permissions,
      jti
    });

    const refreshToken = randomUUID();
    const ttlMs = Number(this.cfg.get<string>("JWT_REFRESH_TTL_MS") ?? `${30 * 24 * 60 * 60 * 1000}`);
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.tokenHash(refreshToken),
        userId,
        orgId,
        membershipId,
        expiresAt: new Date(Date.now() + ttlMs),
        userAgent: metadata?.userAgent ?? null,
        ipAtIssue: metadata?.ip ?? null
      }
    });

    if (auditAction) {
      await this.prisma.auditLog.create({
        data: {
          orgId,
          actorUserId: userId,
          action: auditAction,
          targetType: "user",
          targetId: userId,
          metadata: {}
        }
      });
    }

    return { access_token: accessToken, refresh_token: refreshToken };
  }

  async refresh(
    refreshToken: string,
    metadata?: { userAgent?: string | null; ip?: string | null }
  ) {
    const tokenHash = this.tokenHash(refreshToken);
    const now = new Date();

    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing) throw new UnauthorizedException("Invalid refresh token");
    if (existing.expiresAt < now) throw new UnauthorizedException("Invalid refresh token");

    // Reuse detection: token was already rotated (revoked + replacedById), but is being presented again.
    if (existing.revokedAt && existing.replacedById) {
      await this.prisma.auditLog.create({
        data: {
          orgId: existing.orgId,
          actorUserId: existing.userId,
          action: "identity.auth.refresh.reuse_detected",
          targetType: "refresh_token",
          targetId: existing.id,
          metadata: { replaced_by_id: existing.replacedById }
        }
      });

      // Fail closed: revoke all refresh tokens for this user within this org.
      await this.revokeAllRefreshTokensForUserOrg(existing.userId, existing.orgId, "refresh_reuse_detected");
      throw new UnauthorizedException("Invalid refresh token");
    }
    if (existing.revokedAt) throw new UnauthorizedException("Invalid refresh token");

    const ttlMs = Number(this.cfg.get<string>("JWT_REFRESH_TTL_MS") ?? `${30 * 24 * 60 * 60 * 1000}`);
    const newRefresh = randomUUID();
    const newId = randomUUID();

    // Rotation must be single-use. Do it transactionally to avoid double-refresh races.
    // Record last-used metadata on the existing token, then revoke and create replacement.
    await this.prisma.$transaction(async (tx) => {
      const updateRes = await tx.refreshToken.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: {
          revokedAt: now,
          replacedById: newId,
          lastUsedAt: now,
          lastUsedFromIp: metadata?.ip ?? null
        }
      });
      if (updateRes.count !== 1) {
        // Another refresh won the race; treat as reuse and fail closed.
        await tx.auditLog.create({
          data: {
            orgId: existing.orgId,
            actorUserId: existing.userId,
            action: "identity.auth.refresh.reuse_detected",
            targetType: "refresh_token",
            targetId: existing.id,
            metadata: { reason: "concurrent_refresh" }
          }
        });

        await tx.refreshToken.updateMany({
          where: { userId: existing.userId, orgId: existing.orgId, revokedAt: null },
          data: { revokedAt: now }
        });
        throw new UnauthorizedException("Invalid refresh token");
      }

      await tx.refreshToken.create({
        data: {
          id: newId,
          tokenHash: this.tokenHash(newRefresh),
          userId: existing.userId,
          orgId: existing.orgId,
          membershipId: existing.membershipId,
          expiresAt: new Date(Date.now() + ttlMs),
          userAgent: metadata?.userAgent ?? null,
          ipAtIssue: metadata?.ip ?? null
        }
      });
    });

    const [user, org, membership] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: existing.userId } }),
      this.prisma.organization.findUnique({ where: { id: existing.orgId } }),
      this.prisma.membership.findUnique({ where: { id: existing.membershipId } })
    ]);
    if (!user || !org || !membership) throw new UnauthorizedException("Invalid refresh token");

    const permissions = await this.resolvePermissions(membership.roleId);
    const jti = randomUUID();

    const accessToken = this.jwt.sign({
      sub: user.id,
      org_id: org.id,
      membership_id: membership.id,
      role_id: membership.roleId ?? null,
      perms: permissions,
      jti
    });

    await this.prisma.auditLog.create({
      data: {
        orgId: org.id,
        actorUserId: user.id,
        action: "identity.auth.refresh",
        targetType: "user",
        targetId: user.id,
        metadata: {}
      }
    });

    return { access_token: accessToken, refresh_token: newRefresh, user, org, membership };
  }

  async logout(refreshToken: string) {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokenHash(refreshToken) }
    });
    if (!existing || existing.revokedAt) throw new UnauthorizedException("Invalid refresh token");

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() }
    });

    await this.prisma.auditLog.create({
      data: {
        orgId: existing.orgId,
        actorUserId: existing.userId,
        action: "identity.auth.logout",
        targetType: "user",
        targetId: existing.userId,
        metadata: {}
      }
    });
  }

  async logoutAll(userId: string, orgId: string) {
    await this.revokeAllRefreshTokensForUserOrg(userId, orgId, "user_requested_logout_all");
    await this.prisma.auditLog.create({
      data: {
        orgId,
        actorUserId: userId,
        action: "identity.auth.logout_all",
        targetType: "user",
        targetId: userId,
        metadata: {}
      }
    });
  }
}

