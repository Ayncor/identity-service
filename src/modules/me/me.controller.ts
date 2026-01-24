import { Controller, Get, Req, UnauthorizedException, UseGuards } from "@nestjs/common";

import { JwtAuthGuard, type RequestWithPrincipal } from "../../shared/auth/auth.guard";
import { InMemoryStore } from "../storage/storage.store";

@Controller()
export class MeController {
  constructor(private readonly store: InMemoryStore) {}

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: RequestWithPrincipal) {
    const p = req.principal!;
    const user = this.store.usersById.get(p.user_id);
    const org = this.store.orgsById.get(p.org_id);
    const membership = this.store.membershipsById.get(p.membership_id);
    if (!user || !org || !membership) {
      throw new UnauthorizedException("Invalid session");
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url ?? null,
        status: user.status,
        email_verified_at: user.email_verified_at ?? null,
        created_at: user.created_at,
        updated_at: user.updated_at,
        deleted_at: user.deleted_at ?? null
      },
      membership: {
        id: membership.id,
        org_id: membership.org_id,
        user_id: membership.user_id,
        role_id: membership.role_id ?? null,
        status: membership.status,
        joined_at: membership.joined_at ?? null,
        invited_by_user_id: membership.invited_by_user_id ?? null,
        created_at: membership.created_at,
        updated_at: membership.updated_at
      },
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        status: org.status,
        created_at: org.created_at,
        updated_at: org.updated_at,
        deleted_at: org.deleted_at ?? null
      }
    };
  }
}

