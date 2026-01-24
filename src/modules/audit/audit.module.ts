import { Module } from "@nestjs/common";

import { StorageModule } from "../storage/storage.module";
import { AuthModule } from "../auth/auth.module";
import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";

@Module({
  imports: [StorageModule, AuthModule],
  controllers: [AuditController],
  providers: [AuditService]
})
export class AuditModule {}

