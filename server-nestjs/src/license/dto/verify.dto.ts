import { IsString } from 'class-validator';

export class VerifyDto {
  @IsString()
  licenseKey: string;

  @IsString()
  deviceId: string;

  @IsString()
  clientType?: string;
}
