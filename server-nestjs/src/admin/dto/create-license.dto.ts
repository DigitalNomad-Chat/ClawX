import { IsString, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateLicenseDto {
  @IsString()
  tier: 'pro' | 'enterprise';

  @IsNumber()
  @IsOptional()
  @Min(1)
  durationDays?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  maxDevices?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
