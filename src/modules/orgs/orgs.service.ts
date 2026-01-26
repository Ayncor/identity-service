import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";

import { PrismaService } from "../storage/prisma.service";
import { AuthService } from "../auth/auth.service";
import { ROLE_IDS } from "../storage/storage.types";

function nowIso(): string {
  return new Date().toISOString();
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

function verifyPassword(password: string, salt: string, expectedHashHex: string): boolean {
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHashHex, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

@Injectable()
export class OrgsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService
  ) {}

  async createOrg(actorUserId: string, name: string, slug: string) {
    const existing = await this.prisma.organization.findUnique({ where: { slug } });
    if (existing) throw new ConflictException("Org slug already exists");

    const org = await this.prisma.organization.create({ data: { name, slug } });

    // Ensure system roles exist for the new org
    let adminRole = await this.prisma.role.findUnique({
      where: { orgId_name: { orgId: org.id, name: "ORG_ADMIN" } }
    });
    if (!adminRole) {
      adminRole = await this.prisma.role.create({
        data: {
          orgId: org.id,
          name: "ORG_ADMIN",
          permissions: ["org:read", "org:manage_members", "org:manage_roles", "audit:read", "channels:manage", "threads:moderate"],
          isSystem: true
        }
      });
    }

    const membership = await this.prisma.membership.create({
      data: {
        orgId: org.id,
        userId: actorUserId,
        roleId: adminRole.id,
        status: "ACTIVE",
        joinedAt: new Date()
      }
    });

    await this.prisma.auditLog.createMany({
      data: [
        {
          orgId: org.id,
          actorUserId,
          action: "identity.org.created",
          targetType: "org",
          targetId: org.id,
          metadata: { slug }
        },
        {
          orgId: org.id,
          actorUserId,
          action: "identity.membership.created",
          targetType: "membership",
          targetId: membership.id,
          metadata: { user_id: actorUserId, role_id: membership.roleId }
        }
      ]
    });

    return { org, membership };
  }

  async getOrg(orgId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException("Org not found");
    return org;
  }

  private async assertOrgAdmin(orgId: string, actorMembershipId: string) {
    const actor = await this.prisma.membership.findUnique({
      where: { id: actorMembershipId },
      include: { role: true }
    });
    if (!actor || actor.orgId !== orgId) throw new ForbiddenException("Forbidden");
    if (actor.status !== "ACTIVE") throw new ForbiddenException("Forbidden");
    if (!actor.role || actor.role.name !== "ORG_ADMIN") throw new ForbiddenException("Forbidden");
  }

  private tokenHash(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  private async getInviteByToken(orgId: string, token: string) {
    const invite = await this.prisma.orgInvite.findUnique({ where: { tokenHash: this.tokenHash(token) } });
    if (!invite || invite.orgId !== orgId) throw new NotFoundException("Invite not found");
    return invite;
  }

  private assertInviteUsable(invite: { revokedAt: Date | null; declinedAt: Date | null; acceptedAt: Date | null; expiresAt: Date }) {
    if (invite.revokedAt || invite.declinedAt || invite.acceptedAt) throw new ConflictException("Invite no longer valid");
    if (invite.expiresAt < new Date()) throw new ConflictException("Invite expired");
  }

  async createInvite(orgId: string, actorUserId: string, actorMembershipId: string, email: string, roleId?: string | null) {
    await this.assertOrgAdmin(orgId, actorMembershipId);
    const org = await this.getOrg(orgId);

    const normalizedEmail = email.toLowerCase();

    // Reuse or create an invite. If there is an outstanding invite, revoke it and issue a new one.
    const existingActive = await this.prisma.orgInvite.findFirst({
      where: {
        orgId: org.id,
        email: normalizedEmail,
        revokedAt: null,
        acceptedAt: null,
        declinedAt: null,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: "desc" }
    });

    if (existingActive) {
      await this.prisma.orgInvite.update({ where: { id: existingActive.id }, data: { revokedAt: new Date() } });
    }

    // Resolve default role if not provided
    let finalRoleId = roleId;
    if (!finalRoleId) {
      const memberRole = await this.prisma.role.findUnique({
        where: { orgId_name: { orgId: org.id, name: "ORG_MEMBER" } }
      });
      if (!memberRole) throw new NotFoundException("ORG_MEMBER role not found for org");
      finalRoleId = memberRole.id;
    }

    const token = randomUUID();
    const ttlMs = 7 * 24 * 60 * 60 * 1000; // 7 days
    const invite = await this.prisma.orgInvite.create({
      data: {
        orgId: org.id,
        email: normalizedEmail,
        roleId: finalRoleId,
        invitedByUserId: actorUserId,
        tokenHash: this.tokenHash(token),
        expiresAt: new Date(Date.now() + ttlMs)
      }
    });

    await this.prisma.auditLog.create({
      data: {
        orgId: org.id,
        actorUserId,
        action: "identity.invite.created",
        targetType: "org_invite",
        targetId: invite.id,
        metadata: { email: normalizedEmail, role_id: invite.roleId }
      }
    });

    return { invite, token };
  }

  async listInvites(orgId: string, actorMembershipId: string) {
    await this.assertOrgAdmin(orgId, actorMembershipId);
    await this.getOrg(orgId);

    return await this.prisma.orgInvite.findMany({
      where: { orgId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });
  }

  async revokeInvite(orgId: string, actorUserId: string, actorMembershipId: string, inviteId: string) {
    await this.assertOrgAdmin(orgId, actorMembershipId);
    const invite = await this.prisma.orgInvite.findUnique({ where: { id: inviteId } });
    if (!invite || invite.orgId !== orgId) throw new NotFoundException("Invite not found");

    await this.prisma.orgInvite.update({
      where: { id: inviteId },
      data: { revokedAt: new Date() }
    });

    await this.prisma.auditLog.create({
      data: {
        orgId,
        actorUserId,
        action: "identity.invite.revoked",
        targetType: "org_invite",
        targetId: inviteId,
        metadata: {}
      }
    });
  }

  async verifyInvite(orgId: string, token: string) {
    const invite = await this.getInviteByToken(orgId, token);
    this.assertInviteUsable(invite);

    const org = await this.getOrg(orgId);
    return {
      org: { id: org.id, name: org.name, slug: org.slug },
      invite: {
        id: invite.id,
        org_id: invite.orgId,
        email: invite.email,
        role_id: invite.roleId ?? null,
        invited_by_user_id: invite.invitedByUserId ?? null,
        created_at: invite.createdAt.toISOString(),
        expires_at: invite.expiresAt.toISOString()
      }
    };
  }

  async acceptInvitePublic(orgId: string, token: string, password: string, displayName?: string) {
    const invite = await this.getInviteByToken(orgId, token);
    this.assertInviteUsable(invite);

    const normalizedEmail = invite.email.toLowerCase();

    const org = await this.getOrg(orgId);

    // Find or create user; for existing user validate password.
    let user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      const salt = randomBytes(16).toString("hex");
      user = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          displayName: (displayName ?? normalizedEmail.split("@")[0] ?? "user").trim(),
          passwordHash: hashPassword(password, salt),
          passwordSalt: salt,
          status: "ACTIVE"
        }
      });
    } else {
      if (user.status !== "ACTIVE") throw new UnauthorizedException("Invalid credentials");
      if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) throw new UnauthorizedException("Invalid credentials");
    }

    const membership = await this.prisma.membership.findUnique({
      where: { orgId_userId: { orgId, userId: user.id } }
    });
    if (membership && membership.status === "ACTIVE") throw new ConflictException("Already a member");

    // Resolve default role if invite doesn't have one
    let finalRoleId = invite.roleId;
    if (!finalRoleId) {
      const memberRole = await this.prisma.role.findUnique({
        where: { orgId_name: { orgId, name: "ORG_MEMBER" } }
      });
      if (!memberRole) throw new NotFoundException("ORG_MEMBER role not found for org");
      finalRoleId = memberRole.id;
    }

    const updatedMembership = await this.prisma.$transaction(async (tx) => {
      const m =
        membership ??
        (await tx.membership.create({
          data: {
            orgId,
            userId: user.id,
            roleId: finalRoleId,
            status: "INVITED",
            joinedAt: null,
            invitedByUserId: invite.invitedByUserId
          }
        }));

      const next = await tx.membership.update({
        where: { id: m.id },
        data: {
          roleId: invite.roleId ?? m.roleId,
          status: "ACTIVE",
          joinedAt: m.joinedAt ?? new Date()
        }
      });

      await tx.orgInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      return next;
    });

    await this.prisma.auditLog.create({
      data: {
        orgId,
        actorUserId: user.id,
        action: "identity.invite.accepted",
        targetType: "org_invite",
        targetId: invite.id,
        metadata: { membership_id: updatedMembership.id }
      }
    });

    const session = await this.auth.issueSessionForMembership(user.id, orgId, updatedMembership.id, "identity.auth.invite.accepted");

    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user: { id: user.id, email: user.email, display_name: user.displayName },
      org: { id: org.id, name: org.name, slug: org.slug },
      membership: updatedMembership
    };
  }

  async declineInvitePublic(orgId: string, token: string) {
    const invite = await this.getInviteByToken(orgId, token);
    this.assertInviteUsable(invite);

    await this.prisma.orgInvite.update({ where: { id: invite.id }, data: { declinedAt: new Date() } });

    await this.prisma.auditLog.create({
      data: {
        orgId,
        actorUserId: null,
        action: "identity.invite.declined",
        targetType: "org_invite",
        targetId: invite.id,
        metadata: {}
      }
    });
  }

  async createMember(orgId: string, actorUserId: string, actorMembershipId: string, email: string, roleId?: string | null) {
    await this.assertOrgAdmin(orgId, actorMembershipId);
    const org = await this.getOrg(orgId);

    const normalizedEmail = email.toLowerCase();
    let user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });

    // If user doesn't exist, create an INVITED user with a random password.
    if (!user) {
      const salt = randomBytes(16).toString("hex");
      const pw = randomBytes(24).toString("hex");
      user = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          displayName: normalizedEmail.split("@")[0] ?? "user",
          passwordHash: hashPassword(pw, salt),
          passwordSalt: salt,
          status: "ACTIVE"
        }
      });
      // NOTE: actual invite/email flow comes later.
    }

    const existingMembership = await this.prisma.membership.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: user.id } }
    });
    if (existingMembership) throw new ConflictException("Membership already exists");

    // Resolve default role if not provided
    let finalRoleId = roleId;
    if (!finalRoleId) {
      const memberRole = await this.prisma.role.findUnique({
        where: { orgId_name: { orgId: org.id, name: "ORG_MEMBER" } }
      });
      if (!memberRole) throw new NotFoundException("ORG_MEMBER role not found for org");
      finalRoleId = memberRole.id;
    }

    const membership = await this.prisma.membership.create({
      data: {
        orgId: org.id,
        userId: user.id,
        roleId: finalRoleId,
        status: "INVITED",
        joinedAt: null,
        invitedByUserId: actorUserId
      }
    });

    await this.prisma.auditLog.create({
      data: {
        orgId: org.id,
        actorUserId,
        action: "identity.membership.invited",
        targetType: "membership",
        targetId: membership.id,
        metadata: { email: normalizedEmail, role_id: membership.roleId }
      }
    });

    return membership;
  }

  async updateMember(
    orgId: string,
    actorUserId: string,
    actorMembershipId: string,
    memberId: string,
    updates: { role_id?: string | null; status?: "ACTIVE" | "SUSPENDED" | "LEFT" }
  ) {
    await this.assertOrgAdmin(orgId, actorMembershipId);

    const m = await this.prisma.membership.findUnique({ where: { id: memberId } });
    if (!m || m.orgId !== orgId) throw new NotFoundException("Membership not found");

    const nextStatus =
      updates.status === "ACTIVE" ? "ACTIVE" : updates.status === "SUSPENDED" ? "SUSPENDED" : updates.status === "LEFT" ? "LEFT" : undefined;

    const updated = await this.prisma.membership.update({
      where: { id: memberId },
      data: {
        roleId: updates.role_id !== undefined ? updates.role_id : undefined,
        status: nextStatus as any,
        joinedAt: nextStatus === "ACTIVE" && !m.joinedAt ? new Date() : undefined
      }
    });

    await this.prisma.auditLog.create({
      data: {
        orgId,
        actorUserId,
        action: "identity.membership.updated",
        targetType: "membership",
        targetId: memberId,
        metadata: { updates }
      }
    });

    return updated;
  }
}

