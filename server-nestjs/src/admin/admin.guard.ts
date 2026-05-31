import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const auth = request.headers['authorization'];

    if (!auth) {
      throw new UnauthorizedException('Unauthorized');
    }

    const token = auth.replace('Bearer ', '').trim();
    const adminKey =
      process.env.ADMIN_API_KEY || 'dev-admin-key-change-in-production';

    // 1. Check API Key (backward compatible)
    if (token === adminKey) {
      return true;
    }

    // 2. Check Admin JWT
    try {
      const payload = this.jwtService.verify(token);
      if (payload.role === 'admin') {
        return true;
      }
    } catch {
      // Invalid JWT, fall through to throw
    }

    throw new UnauthorizedException('Unauthorized');
  }
}
