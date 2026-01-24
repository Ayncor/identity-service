/// <reference types="node" />
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  // Prisma CLI uses this datasource for migrate/dev/studio/etc.
  // Keep it tolerant so `prisma generate` works even if DATABASE_URL is not set.
  datasource: {
    url: process.env.DATABASE_URL ?? ""
  }
});

