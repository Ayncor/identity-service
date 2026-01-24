import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AuthModule } from "./modules/auth/auth.module";
import { MeModule } from "./modules/me/me.module";
import { OrgsModule } from "./modules/orgs/orgs.module";
import { AuditModule } from "./modules/audit/audit.module";
import { StorageModule } from "./modules/storage/storage.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    StorageModule,
    AuthModule,
    MeModule,
    OrgsModule,
    AuditModule
  ]
})
export class AppModule {}

