import { IsString } from 'class-validator';

export class RecordUsageDto {
  @IsString()
  feature: string;
}
