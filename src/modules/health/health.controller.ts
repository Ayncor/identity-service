import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";

import { PrismaService } from "../storage/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  live() {
    return {
      status: "ok",
      ts: new Date().toISOString()
    };
  }

  @Get("ready")
  async ready() {
    const startedAt = Date.now();
    try {
      // A cheap query to verify DB connectivity.
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: "ok",
        db: "ok",
        latency_ms: Date.now() - startedAt,
        ts: new Date().toISOString()
      };
    } catch {
      // Readiness should fail closed with 503 so orchestration can stop routing traffic.
      throw new ServiceUnavailableException({
        status: "error",
        db: "down",
        latency_ms: Date.now() - startedAt,
        ts: new Date().toISOString()
      });
    }
  }
}

