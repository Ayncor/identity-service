import { Body, Controller, HttpCode, Post } from "@nestjs/common";

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

  private toUser(u: any) {
    // Match the v1 OpenAPI shape (User schema)
    return {
      id: u.id,
      email: u.email,
      display_name: u.display_name,
      avatar_url: u.avatar_url ?? null,
      status: u.status,
      email_verified_at: u.email_verified_at ?? null,
      created_at: u.created_at,
      updated_at: u.updated_at,
      deleted_at: u.deleted_at ?? null
    };
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

