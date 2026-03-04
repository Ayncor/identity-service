import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  IsArray,
  ValidateNested
} from "class-validator";
import { Type } from "class-transformer";

export class SignupInviteDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  role_id?: string | null;
}

export class SignupRequestDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  display_name!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  org_name!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(60)
  @Matches(/^[a-z0-9-]+$/)
  org_slug!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SignupInviteDto)
  invites?: SignupInviteDto[];
}

export class LoginRequestDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  org_slug!: string;
}

export class RefreshRequestDto {
  @IsString()
  @IsNotEmpty()
  refresh_token!: string;
}

export class LogoutRequestDto {
  @IsString()
  @IsNotEmpty()
  refresh_token!: string;
}

// Placeholder: API surface reserved (implementation later)
export class PasswordResetRequestDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  org_slug?: string;
}

// Placeholder: API surface reserved (implementation later)
export class PasswordResetConfirmDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(8)
  new_password!: string;
}

