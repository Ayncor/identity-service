import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { Request } from "express";

import { JwtAuthGuard, type RequestWithPrincipal } from "../../shared/auth/auth.guard";
import { getRequestMetadata } from "../../shared/http/request-metadata";
import {
  AcceptInviteRequestDto,
  CreateInviteRequestDto,
  CreateMemberRequestDto,
  CreateOrgRequestDto,
  CreateRoleRequestDto,
  DeclineInviteRequestDto,
  RevokeInviteRequestDto,
  UpdateMemberRequestDto,
  UpdateOrgSettingsRequestDto,
  UpdateRoleRequestDto,
  VerifyInviteRequestDto
} from "./orgs.dto";
import { SignupRequestDto } from "../auth/auth.dto";
import { OrgsService } from "./orgs.service";

@Controller()
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  /** Public: check if team URL (slug) is available for sign-up. */
  @Get("orgs/availability/slug")
  async slugAvailable(@Query("slug") slug: string) {
    const available = await this.orgs.isSlugAvailable(slug ?? "");
    return { available };
  }

  /** Public: sign up — create user + org, optionally invite team. Rate limited. */
  @Post("orgs/signup")
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async signup(@Req() req: Request, @Body() body: SignupRequestDto) {
    const metadata = getRequestMetadata(req);
    const session = await this.orgs.signup(
      body.email,
      body.password,
      body.display_name,
      body.org_name,
      body.org_slug,
      body.invites ?? [],
      metadata
    );
    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user: this.toUser(session.user),
      membership: this.toMembership(session.membership),
      org: this.toOrg(session.org),
      invites_created: session.invites_created
    };
  }

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

  @Get("orgs/:orgId/settings")
  @UseGuards(JwtAuthGuard)
  async getOrgSettings(@Req() req: RequestWithPrincipal, @Param("orgId") orgId: string) {
    const p = req.principal!;
    return this.orgs.getOrgSettings(orgId, p.membership_id);
  }

  @Patch("orgs/:orgId/settings")
  @UseGuards(JwtAuthGuard)
  async updateOrgSettings(
    @Req() req: RequestWithPrincipal,
    @Param("orgId") orgId: string,
    @Body() body: UpdateOrgSettingsRequestDto
  ) {
    const p = req.principal!;
    return this.orgs.updateOrgSettings(orgId, p.user_id, p.membership_id, {
      allowed_email_domains: body.allowed_email_domains,
      require_company_email: body.require_company_email
    });
  }

  @Get("orgs/:orgId/roles")
  @UseGuards(JwtAuthGuard)
  async listRoles(@Req() req: RequestWithPrincipal, @Param("orgId") orgId: string) {
    const p = req.principal!;
    const roles = await this.orgs.listRoles(orgId, p.org_id);
    return { items: roles.map((r) => this.toRole(r)) };
  }

  @Post("orgs/:orgId/roles")
  @UseGuards(JwtAuthGuard)
  async createRole(
    @Req() req: RequestWithPrincipal,
    @Param("orgId") orgId: string,
    @Body() body: CreateRoleRequestDto
  ) {
    const p = req.principal!;
    const role = await this.orgs.createRole(orgId, p.user_id, p.membership_id, body.name, body.permissions);
    return { role: this.toRole(role) };
  }

  @Patch("orgs/:orgId/roles/:roleId")
  @UseGuards(JwtAuthGuard)
  async updateRole(
    @Req() req: RequestWithPrincipal,
    @Param("orgId") orgId: string,
    @Param("roleId") roleId: string,
    @Body() body: UpdateRoleRequestDto
  ) {
    const p = req.principal!;
    const role = await this.orgs.updateRole(orgId, p.user_id, p.membership_id, roleId, {
      name: body.name,
      permissions: body.permissions
    });
    return { role: this.toRole(role) };
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

  @Post("orgs/:orgId/invites")
  @UseGuards(JwtAuthGuard)
  async createInvite(@Req() req: RequestWithPrincipal, @Param("orgId") orgId: string, @Body() body: CreateInviteRequestDto) {
    const p = req.principal!;
    const created = await this.orgs.createInvite(orgId, p.user_id, p.membership_id, body.email, body.role_id ?? null);
    return {
      invite: this.toInvite(created.invite),
      // token is only returned once (caller must deliver it out-of-band for now)
      token: created.token
    };
  }

  @Get("orgs/:orgId/invites")
  @UseGuards(JwtAuthGuard)
  async listInvites(@Req() req: RequestWithPrincipal, @Param("orgId") orgId: string) {
    const p = req.principal!;
    const invites = await this.orgs.listInvites(orgId, p.membership_id);
    return { items: invites.map((i) => this.toInvite(i)) };
  }

  @Post("orgs/:orgId/invites/revoke")
  @UseGuards(JwtAuthGuard)
  async revokeInvite(@Req() req: RequestWithPrincipal, @Param("orgId") orgId: string, @Body() body: RevokeInviteRequestDto) {
    const p = req.principal!;
    await this.orgs.revokeInvite(orgId, p.user_id, p.membership_id, body.invite_id);
  }

  // Public: validates invite token and returns safe details (no tokenHash leakage).
  @Post("orgs/:orgId/invites/verify")
  async verifyInvite(@Param("orgId") orgId: string, @Body() body: VerifyInviteRequestDto) {
    const details = await this.orgs.verifyInvite(orgId, body.token);
    return details;
  }

  @Post("orgs/:orgId/invites/accept")
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async acceptInvite(@Req() req: Request, @Param("orgId") orgId: string, @Body() body: AcceptInviteRequestDto) {
    const metadata = getRequestMetadata(req);
    const session = await this.orgs.acceptInvitePublic(orgId, body.token, body.password, body.display_name, metadata);
    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user: session.user,
      membership: this.toMembership(session.membership),
      org: session.org
    };
  }

  @Post("orgs/:orgId/invites/decline")
  async declineInvite(@Param("orgId") orgId: string, @Body() body: DeclineInviteRequestDto) {
    await this.orgs.declineInvitePublic(orgId, body.token);
  }

  private toUser(u: any) {
    return {
      id: u.id,
      email: u.email,
      display_name: u.displayName ?? u.display_name,
      avatar_url: (u.avatarUrl ?? u.avatar_url) ?? null,
      status: u.status,
      email_verified_at: u.emailVerifiedAt ? u.emailVerifiedAt.toISOString() : u.email_verified_at ?? null,
      created_at: u.createdAt ? u.createdAt.toISOString() : u.created_at,
      updated_at: u.updatedAt ? u.updatedAt.toISOString() : u.updated_at,
      deleted_at: u.deletedAt ? u.deletedAt.toISOString() : u.deleted_at ?? null
    };
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

  private toInvite(i: any) {
    return {
      id: i.id,
      org_id: i.orgId,
      email: i.email,
      role_id: i.roleId ?? null,
      invited_by_user_id: i.invitedByUserId ?? null,
      created_at: i.createdAt.toISOString(),
      expires_at: i.expiresAt.toISOString(),
      accepted_at: i.acceptedAt ? i.acceptedAt.toISOString() : null,
      declined_at: i.declinedAt ? i.declinedAt.toISOString() : null,
      revoked_at: i.revokedAt ? i.revokedAt.toISOString() : null
    };
  }

  private toRole(r: any) {
    return {
      id: r.id,
      org_id: r.orgId,
      name: r.name,
      permissions: r.permissions,
      is_system: r.isSystem,
      created_at: r.createdAt.toISOString(),
      updated_at: r.updatedAt.toISOString()
    };
  }
}

