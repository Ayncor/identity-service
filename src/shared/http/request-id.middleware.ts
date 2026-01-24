import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";

export type RequestWithId = Request & { requestId?: string };

export function RequestIdMiddleware(req: RequestWithId, res: Response, next: NextFunction) {
  const header = req.header("x-request-id");
  const requestId = header && header.trim().length > 0 ? header : randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}

