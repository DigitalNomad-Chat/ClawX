import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { CaptchaService } from './captcha.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-jwt-secret-change-me',
      signOptions: { expiresIn: '2h' },
    }),
  ],
  providers: [AdminService, CaptchaService],
  controllers: [AdminController],
})
export class AdminModule {}
