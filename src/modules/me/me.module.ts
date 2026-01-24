import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { StorageModule } from "../storage/storage.module";
import { AuthModule } from "../auth/auth.module";
import { MeController } from "./me.controller";

@Module({
  imports: [StorageModule, JwtModule, AuthModule],
  controllers: [MeController]
})
export class MeModule {}

