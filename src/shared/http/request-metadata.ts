import type { Request } from "express";

/** Client IP and User-Agent from the request, for refresh-token metadata and audit. */
export function getRequestMetadata(req: Request): { userAgent: string | null; ip: string | null } {
  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    (req as Request & { ip?: string }).ip ??
    (typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() ?? null : null) ??
    (req.socket?.remoteAddress ?? null);
  const userAgent = (req.get?.("User-Agent") ?? req.headers["user-agent"] ?? null) as string | null;
  return { userAgent: userAgent ?? null, ip: ip ?? null };
}
