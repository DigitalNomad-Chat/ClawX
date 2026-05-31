import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AuthModule } from './auth/auth.module';
import { LicenseModule } from './license/license.module';
import { UsageModule } from './usage/usage.module';
import { AdminModule } from './admin/admin.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'public', 'admin'),
      serveRoot: '/admin',
    }),
    PrismaModule,
    AuthModule,
    LicenseModule,
    UsageModule,
    AdminModule,
  ],
})
export class AppModule {}
