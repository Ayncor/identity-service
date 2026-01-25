import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MinLength } from "class-validator";

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

