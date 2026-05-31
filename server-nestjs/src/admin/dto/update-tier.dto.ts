import { IsString, IsNumber, IsOptional, IsArray } from 'class-validator';

export class UpdateTierDto {
  @IsString()
  @IsOptional()
  displayName?: string;

  @IsNumber()
  @IsOptional()
  monthlyQuota?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  features?: string[];

  @IsNumber()
  @IsOptional()
  maxDevices?: number;
}
