import { IsString } from 'class-validator';

export class ActivateDto {
  @IsString()
  licenseKey: string;

  @IsString()
  deviceId: string;

  @IsString()
  userId?: string;

  @IsString()
  clientType?: string;
}
