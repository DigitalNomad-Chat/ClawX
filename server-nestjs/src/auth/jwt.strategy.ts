import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET || 'dev-jwt-secret-change-me',
    });
  }

  async validate(payload: any) {
    const tokenHash = require('crypto')
      .createHash('sha256')
      .update(ExtractJwt.fromAuthHeaderAsBearerToken()(this as any) || '')
      .digest('hex');

    const session = await this.prisma.session.findFirst({
      where: {
        tokenHash,
        expiresAt: { gt: new Date() },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Session expired');
    }

    return {
      userId: payload.sub,
      username: payload.username,
      tier: payload.tier,
    };
  }
}
