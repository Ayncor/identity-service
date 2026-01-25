import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateOrgRequestDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(60)
  @Matches(/^[a-z0-9-]+$/)
  slug!: string;
}

export class CreateMemberRequestDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  role_id?: string | null;
}

export class UpdateMemberRequestDto {
  @IsOptional()
  @IsString()
  role_id?: string | null;

  @IsOptional()
  @IsIn(["ACTIVE", "SUSPENDED", "LEFT"])
  status?: "ACTIVE" | "SUSPENDED" | "LEFT";
}

export class CreateInviteRequestDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  role_id?: string | null;
}

export class RevokeInviteRequestDto {
  @IsString()
  invite_id!: string;
}

export class AcceptInviteRequestDto {
  @IsString()
  token!: string;

  // For existing users, this validates ownership of the email.
  // For new users, this becomes their initial password.
  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  display_name?: string;
}

export class DeclineInviteRequestDto {
  @IsString()
  token!: string;
}

export class VerifyInviteRequestDto {
  @IsString()
  token!: string;
}

