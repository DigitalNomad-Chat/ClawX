import { IsString } from 'class-validator';

export class CheckUsageDto {
  @IsString()
  feature: string;
}
