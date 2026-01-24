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
    const result = this.audit.listOrgAudit(
      orgId,
      p.org_id,
      pageSize ? Number(pageSize) : 50,
      cursor ?? null,
      action
    );

    return {
      items: result.items.map((e) => ({
        id: e.id,
        org_id: e.org_id,
        actor_user_id: e.actor_user_id ?? null,
        action: e.action,
        target_type: e.target_type,
        target_id: e.target_id ?? null,
        metadata_json: e.metadata_json,
        created_at: e.created_at
      })),
      next_cursor: result.next_cursor
    };
  }
}

