import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { JwtService } from "@nestjs/jwt";
import type { AuthPrincipal, JwtAccessClaims } from "./auth.types";

export type RequestWithPrincipal = Request & { principal?: AuthPrincipal };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const auth = req.header("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
    if (!token) throw new UnauthorizedException("Missing bearer token");

    try {
      const claims = this.jwt.verify<JwtAccessClaims>(token);
      if (!claims?.sub || !claims.org_id || !claims.membership_id) {
        throw new UnauthorizedException("Invalid token");
      }
      req.principal = {
        user_id: claims.sub,
        org_id: claims.org_id,
        membership_id: claims.membership_id,
        role_id: claims.role_id ?? null
      };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid token");
    }
  }
}

