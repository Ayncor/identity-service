import { Module } from "@nestjs/common";

import { InMemoryStore } from "./storage.store";

@Module({
  providers: [InMemoryStore],
  exports: [InMemoryStore]
})
export class StorageModule {}

