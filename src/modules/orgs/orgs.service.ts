import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes, scryptSync } from "crypto";

import { PrismaService } from "../storage/prisma.service";
import { AuthService } from "../auth/auth.service";
import { ROLE_IDS } from "../storage/storage.types";

function nowIso(): string {
  return new Date().toISOString();
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
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

    const membership = await this.prisma.membership.create({
      data: {
        orgId: org.id,
        userId: actorUserId,
        roleId: this.auth.getRoleIds().ORG_ADMIN,
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
    const actor = await this.prisma.membership.findUnique({ where: { id: actorMembershipId } });
    if (!actor || actor.orgId !== orgId) throw new ForbiddenException("Forbidden");
    if (actor.status !== "ACTIVE") throw new ForbiddenException("Forbidden");
    if (actor.roleId !== this.auth.getRoleIds().ORG_ADMIN) throw new ForbiddenException("Forbidden");
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

    const membership = await this.prisma.membership.create({
      data: {
        orgId: org.id,
        userId: user.id,
        roleId: roleId ?? ROLE_IDS.ORG_MEMBER,
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

