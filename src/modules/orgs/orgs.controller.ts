import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";

import { JwtAuthGuard, type RequestWithPrincipal } from "../../shared/auth/auth.guard";
import { CreateMemberRequestDto, CreateOrgRequestDto, UpdateMemberRequestDto } from "./orgs.dto";
import { OrgsService } from "./orgs.service";

@Controller()
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  @Post("orgs")
  @UseGuards(JwtAuthGuard)
  async createOrg(@Req() req: RequestWithPrincipal, @Body() body: CreateOrgRequestDto) {
    const p = req.principal!;
    const { org, membership } = await this.orgs.createOrg(p.user_id, body.name, body.slug);
    return {
      org: this.toOrg(org),
      membership: this.toMembership(membership)
    };
  }

  @Get("orgs/:orgId")
  @UseGuards(JwtAuthGuard)
  async getOrg(@Param("orgId") orgId: string) {
    const org = await this.orgs.getOrg(orgId);
    return this.toOrg(org);
  }

  @Post("orgs/:orgId/members")
  @UseGuards(JwtAuthGuard)
  async addMember(@Req() req: RequestWithPrincipal, @Param("orgId") orgId: string, @Body() body: CreateMemberRequestDto) {
    const p = req.principal!;
    const m = await this.orgs.createMember(orgId, p.user_id, p.membership_id, body.email, body.role_id ?? null);
    return this.toMembership(m);
  }

  @Patch("orgs/:orgId/members/:memberId")
  @UseGuards(JwtAuthGuard)
  async updateMember(
    @Req() req: RequestWithPrincipal,
    @Param("orgId") orgId: string,
    @Param("memberId") memberId: string,
    @Body() body: UpdateMemberRequestDto
  ) {
    const p = req.principal!;
    const m = await this.orgs.updateMember(orgId, p.user_id, p.membership_id, memberId, {
      role_id: body.role_id,
      status: body.status
    });
    return this.toMembership(m);
  }

  private toOrg(o: any) {
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      status: o.status,
      created_at: o.createdAt ? o.createdAt.toISOString() : o.created_at,
      updated_at: o.updatedAt ? o.updatedAt.toISOString() : o.updated_at,
      deleted_at: o.deletedAt ? o.deletedAt.toISOString() : o.deleted_at ?? null
    };
  }

  private toMembership(m: any) {
    return {
      id: m.id,
      org_id: m.orgId ?? m.org_id,
      user_id: m.userId ?? m.user_id,
      role_id: (m.roleId ?? m.role_id) ?? null,
      status: m.status,
      joined_at: m.joinedAt ? m.joinedAt.toISOString() : m.joined_at ?? null,
      invited_by_user_id: (m.invitedByUserId ?? m.invited_by_user_id) ?? null,
      created_at: m.createdAt ? m.createdAt.toISOString() : m.created_at,
      updated_at: m.updatedAt ? m.updatedAt.toISOString() : m.updated_at
    };
  }
}

