import { Module } from "@nestjs/common";

import { StorageModule } from "../storage/storage.module";
import { AuthModule } from "../auth/auth.module";
import { OrgsController } from "./orgs.controller";
import { OrgsService } from "./orgs.service";

@Module({
  imports: [StorageModule, AuthModule],
  controllers: [OrgsController],
  providers: [OrgsService]
})
export class OrgsModule {}

