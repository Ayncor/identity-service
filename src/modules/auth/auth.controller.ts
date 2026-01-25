import { Body, Controller, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, type RequestWithPrincipal } from "../../shared/auth/auth.guard";
import { LoginRequestDto, LogoutRequestDto, RefreshRequestDto } from "./auth.dto";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  async login(@Body() body: LoginRequestDto) {
    const session = await this.auth.login(body.email, body.password, body.org_slug);
    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user: this.toUser(session.user),
      membership: this.toMembership(session.membership),
      org: this.toOrg(session.org)
    };
  }

  @Post("refresh")
  async refresh(@Body() body: RefreshRequestDto) {
    const session = await this.auth.refresh(body.refresh_token);
    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user: this.toUser(session.user),
      membership: this.toMembership(session.membership),
      org: this.toOrg(session.org)
    };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Body() body: LogoutRequestDto) {
    await this.auth.logout(body.refresh_token);
  }

  @Post("logout-all")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async logoutAll(@Req() req: RequestWithPrincipal) {
    const p = req.principal!;
    await this.auth.logoutAll(p.user_id, p.org_id);
  }

  private toUser(u: any) {
    // Match the v1 OpenAPI shape (User schema)
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
}

