import { ForbiddenException, Injectable } from "@nestjs/common";

import { InMemoryStore } from "../storage/storage.store";

@Injectable()
export class AuditService {
  constructor(private readonly store: InMemoryStore) {}

  listOrgAudit(orgId: string, actorOrgId: string, pageSize: number, cursor?: string | null, action?: string) {
    if (orgId !== actorOrgId) throw new ForbiddenException("Forbidden");

    const all = this.store.auditLogsByOrg.get(orgId) ?? [];
    const filtered = action ? all.filter((e) => e.action === action || e.action.startsWith(action)) : all;

    // Simple cursor: base10 index into list
    const start = cursor ? Math.max(0, Number(cursor)) : 0;
    const size = Math.min(Math.max(1, pageSize), 200);
    const items = filtered.slice(start, start + size);
    const next = start + size < filtered.length ? String(start + size) : null;

    return { items, next_cursor: next };
  }
}

