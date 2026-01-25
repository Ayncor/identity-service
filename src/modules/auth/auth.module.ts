import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { StorageModule } from "../storage/storage.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

function isProbablyWeakSecret(secret: string): boolean {
  // 32 bytes (256-bit) is a good minimum.
  // Base64 strings will be longer; this is just a guardrail.
  return secret.length < 32 || secret === "dev-only-change-me";
}

@Module({
  imports: [
    StorageModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const secret = cfg.get<string>("JWT_ACCESS_SECRET") ?? "dev-only-change-me";
        const nodeEnv = (cfg.get<string>("NODE_ENV") ?? "development").toLowerCase();
        if (nodeEnv !== "development" && isProbablyWeakSecret(secret)) {
          throw new Error("JWT_ACCESS_SECRET is too weak for non-development environments");
        }

        return {
          secret,
        // Use seconds to avoid type mismatch with StringValue typings.
          signOptions: {
            expiresIn: Number(cfg.get<string>("JWT_ACCESS_TTL_SECONDS") ?? "900")
          }
        };
      }
    })
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [JwtModule, AuthService]
})
export class AuthModule {}

