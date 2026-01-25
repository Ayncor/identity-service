import { Injectable, OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";

import { PrismaService } from "../storage/prisma.service";
import { ROLE_IDS } from "../storage/storage.types";

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

    const membership = await this.prisma.membership.create({
      data: {
        orgId: org.id,
        userId: user.id,
        roleId: ROLE_IDS.ORG_ADMIN,
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

  async login(email: string, password: string, orgSlug: string) {
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

    const accessToken = this.jwt.sign({
      sub: user.id,
      org_id: org.id,
      membership_id: membership.id,
      role_id: membership.roleId ?? null
    });

    const refreshToken = randomUUID();
    const ttlMs = Number(this.cfg.get<string>("JWT_REFRESH_TTL_MS") ?? `${30 * 24 * 60 * 60 * 1000}`);
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.tokenHash(refreshToken),
        userId: user.id,
        orgId: org.id,
        membershipId: membership.id,
        expiresAt: new Date(Date.now() + ttlMs)
      }
    });

    await this.prisma.auditLog.create({
      data: {
        orgId: org.id,
        actorUserId: user.id,
        action: "identity.auth.login",
        targetType: "user",
        targetId: user.id,
        metadata: {}
      }
    });

    return { access_token: accessToken, refresh_token: refreshToken, user, org, membership };
  }

  async refresh(refreshToken: string) {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokenHash(refreshToken) }
    });
    if (!existing || existing.revokedAt) throw new UnauthorizedException("Invalid refresh token");
    if (existing.expiresAt < new Date()) throw new UnauthorizedException("Invalid refresh token");

    const newRefresh = randomUUID();
    const ttlMs = Number(this.cfg.get<string>("JWT_REFRESH_TTL_MS") ?? `${30 * 24 * 60 * 60 * 1000}`);
    const created = await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.tokenHash(newRefresh),
        userId: existing.userId,
        orgId: existing.orgId,
        membershipId: existing.membershipId,
        expiresAt: new Date(Date.now() + ttlMs)
      }
    });

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedById: created.id }
    });

    const [user, org, membership] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: existing.userId } }),
      this.prisma.organization.findUnique({ where: { id: existing.orgId } }),
      this.prisma.membership.findUnique({ where: { id: existing.membershipId } })
    ]);
    if (!user || !org || !membership) throw new UnauthorizedException("Invalid refresh token");

    const accessToken = this.jwt.sign({
      sub: user.id,
      org_id: org.id,
      membership_id: membership.id,
      role_id: membership.roleId ?? null
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
}

