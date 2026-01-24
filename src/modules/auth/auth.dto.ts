import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from "class-validator";

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

