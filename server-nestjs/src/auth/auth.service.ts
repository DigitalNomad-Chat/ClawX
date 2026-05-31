import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: dto.username }, { email: dto.email }],
      },
    });

    if (existing) {
      throw new ConflictException('Username or email already exists');
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(dto.password, salt);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        passwordHash,
        passwordSalt: salt,
        tier: 'free',
        balance: 0,
        status: 'active',
      },
    });

    const token = this.jwtService.sign({
      sub: user.id,
      username: user.username,
      tier: user.tier,
    });

    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 86400 * 7 * 1000);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        deviceId: dto.deviceId ?? null,
        tokenHash,
        expiresAt,
      },
    });

    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        tier: user.tier,
        status: user.status,
        balance: user.balance,
      },
      token,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: dto.usernameOrEmail }, { email: dto.usernameOrEmail }],
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'active') {
      throw new ForbiddenException('Account is not active');
    }

    const token = this.jwtService.sign({
      sub: user.id,
      username: user.username,
      tier: user.tier,
    });

    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 86400 * 7 * 1000);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        deviceId: dto.deviceId ?? null,
        tokenHash,
        expiresAt,
      },
    });

    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        tier: user.tier,
        status: user.status,
        balance: user.balance,
        avatarUrl: user.avatarUrl,
      },
      token,
    };
  }

  async logout(token: string) {
    const tokenHash = this.hashToken(token);
    await this.prisma.session.deleteMany({
      where: { tokenHash },
    });
    return { success: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        tier: true,
        status: true,
        balance: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  private hashToken(token: string): string {
    return require('crypto').createHash('sha256').update(token).digest('hex');
  }
}
