import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";

import { JwtAuthGuard, type RequestWithPrincipal } from "../../shared/auth/auth.guard";
import { AuditService } from "./audit.service";

@Controller()
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get("orgs/:orgId/audit")
  @UseGuards(JwtAuthGuard)
  async listOrgAudit(
    @Req() req: RequestWithPrincipal,
    @Param("orgId") orgId: string,
    @Query("page_size") pageSize?: string,
    @Query("cursor") cursor?: string,
    @Query("action") action?: string
  ) {
    const p = req.principal!;
    const result = await this.audit.listOrgAudit(
      orgId,
      p.org_id,
      pageSize ? Number(pageSize) : 50,
      cursor ?? null,
      action
    );

    return {
      items: result.items.map((e) => ({
        id: e.id,
        org_id: (e as any).org_id ?? e.orgId,
        actor_user_id: (e as any).actor_user_id ?? e.actorUserId ?? null,
        action: e.action,
        target_type: (e as any).target_type ?? e.targetType,
        target_id: (e as any).target_id ?? e.targetId ?? null,
        metadata_json: (e as any).metadata_json ?? e.metadata,
        created_at: (e as any).created_at ?? (e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt)
      })),
      next_cursor: result.next_cursor
    };
  }
}

