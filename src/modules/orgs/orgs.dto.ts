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

