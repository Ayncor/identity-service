import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { Response } from "express";

import type { RequestWithId } from "./request-id.middleware";

type ErrorBody = {
  code: string;
  message: string;
  request_id: string;
  details?: Record<string, unknown>;
};

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<RequestWithId>();

    const requestId = req.requestId ?? "unknown";

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      // Nest may return string or object; normalize.
      let message = exception.message;
      let details: Record<string, unknown> | undefined;

      if (typeof payload === "string") {
        message = payload;
      } else if (payload && typeof payload === "object") {
        const p = payload as Record<string, unknown>;
        if (typeof p.message === "string") message = p.message;
        if (typeof p.error === "string") details = { error: p.error };
        if (Array.isArray(p.message)) details = { issues: p.message };
      }

      const body: ErrorBody = {
        code: this.mapStatusToCode(status),
        message,
        request_id: requestId,
        ...(details ? { details } : {})
      };

      res.status(status).json(body);
      return;
    }

    const body: ErrorBody = {
      code: "internal_error",
      message: "Internal server error",
      request_id: requestId
    };

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }

  private mapStatusToCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return "bad_request";
      case HttpStatus.UNAUTHORIZED:
        return "unauthorized";
      case HttpStatus.FORBIDDEN:
        return "forbidden";
      case HttpStatus.NOT_FOUND:
        return "not_found";
      case HttpStatus.CONFLICT:
        return "conflict";
      default:
        return "error";
    }
  }
}

