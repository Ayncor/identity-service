import { ForbiddenException, Injectable } from "@nestjs/common";

import { PrismaService } from "../storage/prisma.service";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async listOrgAudit(orgId: string, actorOrgId: string, pageSize: number, cursor?: string | null, action?: string) {
    if (orgId !== actorOrgId) throw new ForbiddenException("Forbidden");

    // Simple cursor: base10 offset into a stable ordering.
    const start = cursor ? Math.max(0, Number(cursor)) : 0;
    const size = Math.min(Math.max(1, pageSize), 200);
    const where: any = {
      orgId,
      ...(action ? { action: { startsWith: action } } : {})
    };

    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: start,
        take: size
      })
    ]);

    const next = start + items.length < total ? String(start + items.length) : null;

    return { items, next_cursor: next };
  }
}

