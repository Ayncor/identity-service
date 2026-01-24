import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes, scryptSync } from "crypto";

import { InMemoryStore } from "../storage/storage.store";
import { AuthService } from "../auth/auth.service";

function nowIso(): string {
  return new Date().toISOString();
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

@Injectable()
export class OrgsService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly auth: AuthService
  ) {}

  createOrg(actorUserId: string, name: string, slug: string) {
    if (this.store.orgsBySlug.has(slug)) throw new ConflictException("Org slug already exists");

    const org = this.store.createOrg({ name, slug });

    const membership = this.store.createMembership({
      org_id: org.id,
      user_id: actorUserId,
      role_id: this.auth.getRoleIds().ORG_ADMIN,
      status: "ACTIVE",
      joined_at: nowIso(),
      invited_by_user_id: null
    });

    this.store.appendAudit({
      org_id: org.id,
      actor_user_id: actorUserId,
      action: "identity.org.created",
      target_type: "org",
      target_id: org.id,
      metadata_json: { slug }
    });

    this.store.appendAudit({
      org_id: org.id,
      actor_user_id: actorUserId,
      action: "identity.membership.created",
      target_type: "membership",
      target_id: membership.id,
      metadata_json: { user_id: actorUserId, role_id: membership.role_id }
    });

    return { org, membership };
  }

  getOrg(orgId: string) {
    const org = this.store.orgsById.get(orgId);
    if (!org) throw new NotFoundException("Org not found");
    return org;
  }

  assertOrgAdmin(orgId: string, actorMembershipId: string) {
    const actor = this.store.membershipsById.get(actorMembershipId);
    if (!actor || actor.org_id !== orgId) throw new ForbiddenException("Forbidden");
    if (actor.status !== "ACTIVE") throw new ForbiddenException("Forbidden");
    if (actor.role_id !== this.auth.getRoleIds().ORG_ADMIN) throw new ForbiddenException("Forbidden");
  }

  createMember(orgId: string, actorUserId: string, actorMembershipId: string, email: string, roleId?: string | null) {
    this.assertOrgAdmin(orgId, actorMembershipId);
    const org = this.getOrg(orgId);

    const normalizedEmail = email.toLowerCase();
    let user = this.store.usersByEmail.get(normalizedEmail);

    // If user doesn't exist, create an INVITED user with a random password.
    if (!user) {
      const salt = randomBytes(16).toString("hex");
      const pw = randomBytes(24).toString("hex");
      user = this.store.createUser({
        email: normalizedEmail,
        display_name: normalizedEmail.split("@")[0] ?? "user",
        password_hash: hashPassword(pw, salt),
        password_salt: salt,
        status: "ACTIVE"
      });
      // NOTE: actual invite/email flow comes later.
    }

    const key = `${org.id}:${user.id}`;
    if (this.store.membershipsByOrgUser.has(key)) throw new ConflictException("Membership already exists");

    const membership = this.store.createMembership({
      org_id: org.id,
      user_id: user.id,
      role_id: roleId ?? this.auth.getRoleIds().ORG_MEMBER,
      status: "INVITED",
      joined_at: null,
      invited_by_user_id: actorUserId
    });

    this.store.appendAudit({
      org_id: org.id,
      actor_user_id: actorUserId,
      action: "identity.membership.invited",
      target_type: "membership",
      target_id: membership.id,
      metadata_json: { email: normalizedEmail, role_id: membership.role_id }
    });

    return membership;
  }

  updateMember(orgId: string, actorUserId: string, actorMembershipId: string, memberId: string, updates: { role_id?: string | null; status?: "ACTIVE" | "SUSPENDED" | "LEFT" }) {
    this.assertOrgAdmin(orgId, actorMembershipId);

    const m = this.store.membershipsById.get(memberId);
    if (!m || m.org_id !== orgId) throw new NotFoundException("Membership not found");

    const next = { ...m };
    if (updates.role_id !== undefined) next.role_id = updates.role_id;
    if (updates.status !== undefined) {
      // Map API statuses into contract MembershipStatus
      if (updates.status === "ACTIVE") next.status = "ACTIVE";
      if (updates.status === "SUSPENDED") next.status = "SUSPENDED";
      if (updates.status === "LEFT") next.status = "LEFT";
      if (updates.status === "ACTIVE" && !next.joined_at) next.joined_at = nowIso();
    }
    next.updated_at = nowIso();

    this.store.membershipsById.set(memberId, next);
    this.store.membershipsByOrgUser.set(`${next.org_id}:${next.user_id}`, next);

    this.store.appendAudit({
      org_id: orgId,
      actor_user_id: actorUserId,
      action: "identity.membership.updated",
      target_type: "membership",
      target_id: memberId,
      metadata_json: { updates }
    });

    return next;
  }
}

