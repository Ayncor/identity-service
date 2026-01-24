import { Controller, Get, Req, UnauthorizedException, UseGuards } from "@nestjs/common";

import { JwtAuthGuard, type RequestWithPrincipal } from "../../shared/auth/auth.guard";
import { PrismaService } from "../storage/prisma.service";

@Controller()
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: RequestWithPrincipal) {
    const p = req.principal!;
    const [user, org, membership] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: p.user_id } }),
      this.prisma.organization.findUnique({ where: { id: p.org_id } }),
      this.prisma.membership.findUnique({ where: { id: p.membership_id } })
    ]);
    if (!user || !org || !membership) {
      throw new UnauthorizedException("Invalid session");
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        display_name: user.displayName,
        avatar_url: user.avatarUrl ?? null,
        status: user.status,
        email_verified_at: user.emailVerifiedAt?.toISOString() ?? null,
        created_at: user.createdAt.toISOString(),
        updated_at: user.updatedAt.toISOString(),
        deleted_at: user.deletedAt?.toISOString() ?? null
      },
      membership: {
        id: membership.id,
        org_id: membership.orgId,
        user_id: membership.userId,
        role_id: membership.roleId ?? null,
        status: membership.status,
        joined_at: membership.joinedAt?.toISOString() ?? null,
        invited_by_user_id: membership.invitedByUserId ?? null,
        created_at: membership.createdAt.toISOString(),
        updated_at: membership.updatedAt.toISOString()
      },
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        status: org.status,
        created_at: org.createdAt.toISOString(),
        updated_at: org.updatedAt.toISOString(),
        deleted_at: org.deletedAt?.toISOString() ?? null
      }
    };
  }
}

