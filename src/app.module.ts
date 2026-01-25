import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";

import { AuthModule } from "./modules/auth/auth.module";
import { MeModule } from "./modules/me/me.module";
import { OrgsModule } from "./modules/orgs/orgs.module";
import { AuditModule } from "./modules/audit/audit.module";
import { StorageModule } from "./modules/storage/storage.module";
import { HealthModule } from "./modules/health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // In-memory throttling is OK for dev; switch to shared storage (e.g. Redis) for multi-instance deployments.
    ThrottlerModule.forRoot({
      throttlers: [{ name: "default", ttl: 60, limit: 100 }]
    }),
    StorageModule,
    HealthModule,
    AuthModule,
    MeModule,
    OrgsModule,
    AuditModule
  ]
})
export class AppModule {}

