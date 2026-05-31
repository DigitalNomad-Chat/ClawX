import { IsString, IsOptional } from 'class-validator';

export class LoginDto {
  @IsString()
  usernameOrEmail: string;

  @IsString()
  password: string;

  @IsString()
  @IsOptional()
  deviceId?: string;
}
