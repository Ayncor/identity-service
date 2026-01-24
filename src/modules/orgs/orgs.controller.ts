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
    const { org, membership } = this.orgs.createOrg(p.user_id, body.name, body.slug);
    return {
      org: this.toOrg(org),
      membership: this.toMembership(membership)
    };
  }

  @Get("orgs/:orgId")
  @UseGuards(JwtAuthGuard)
  async getOrg(@Param("orgId") orgId: string) {
    const org = this.orgs.getOrg(orgId);
    return this.toOrg(org);
  }

  @Post("orgs/:orgId/members")
  @UseGuards(JwtAuthGuard)
  async addMember(@Req() req: RequestWithPrincipal, @Param("orgId") orgId: string, @Body() body: CreateMemberRequestDto) {
    const p = req.principal!;
    const m = this.orgs.createMember(orgId, p.user_id, p.membership_id, body.email, body.role_id ?? null);
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
    const m = this.orgs.updateMember(orgId, p.user_id, p.membership_id, memberId, {
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
      created_at: o.created_at,
      updated_at: o.updated_at,
      deleted_at: o.deleted_at ?? null
    };
  }

  private toMembership(m: any) {
    return {
      id: m.id,
      org_id: m.org_id,
      user_id: m.user_id,
      role_id: m.role_id ?? null,
      status: m.status,
      joined_at: m.joined_at ?? null,
      invited_by_user_id: m.invited_by_user_id ?? null,
      created_at: m.created_at,
      updated_at: m.updated_at
    };
  }
}

