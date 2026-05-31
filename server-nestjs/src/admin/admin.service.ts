import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { CaptchaService } from './captcha.service';
import { CreateLicenseDto } from './dto/create-license.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateTierDto } from './dto/update-tier.dto';

function generateLicenseKey(): string {
  const segments = [];
  for (let i = 0; i < 3; i++) {
    segments.push(Math.random().toString(36).substring(2, 6).toUpperCase());
  }
  return `CLWX-${segments.join('-')}`;
}

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(
    username: string,
    password: string,
    captchaId: string,
    captchaCode: string,
    captchaService: CaptchaService,
  ) {
    // Verify captcha first
    if (!captchaId || !captchaCode) {
      throw new UnauthorizedException('请输入验证码');
    }
    const captchaValid = captchaService.verify(captchaId, captchaCode);
    if (!captchaValid) {
      throw new UnauthorizedException('验证码错误或已过期');
    }

    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'clawx_admin_2026';

    if (username !== adminUsername || password !== adminPassword) {
      throw new UnauthorizedException('账号或密码错误');
    }

    const token = this.jwtService.sign({ role: 'admin', sub: 'admin' });
    return { token, expiresIn: '2h' };
  }

  async createLicense(dto: CreateLicenseDto) {
    const licenseKey = generateLicenseKey();
    const durationDays = dto.durationDays ?? 365;
    const maxDevices = dto.maxDevices ?? (dto.tier === 'enterprise' ? 5 : 2);

    const license = await this.prisma.license.create({
      data: {
        licenseKey,
        tier: dto.tier,
        maxDevices,
        durationDays,
        notes: dto.notes ?? null,
      },
    });

    return {
      id: license.id,
      licenseKey: license.licenseKey,
      tier: license.tier,
      maxDevices: license.maxDevices,
      durationDays: license.durationDays,
      createdAt: Math.floor(license.createdAt.getTime() / 1000),
    };
  }

  async listLicenses(limit: number, offset: number, status?: string) {
    const where = status ? { status: status as any } : {};

    const [licenses, total] = await Promise.all([
      this.prisma.license.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.license.count({ where }),
    ]);

    return { licenses, total, limit, offset };
  }

  async revokeLicense(licenseKey: string) {
    const result = await this.prisma.license.updateMany({
      where: { licenseKey, status: 'active' },
      data: { status: 'revoked' },
    });

    if (result.count === 0) {
      throw new NotFoundException('License not found or already revoked');
    }

    await this.prisma.activation.updateMany({
      where: { licenseKey },
      data: { revoked: true },
    });

    return { success: true, licenseKey };
  }

  async listUsers(limit: number, offset: number, tier?: string, status?: string) {
    const where: any = {};
    if (tier) where.tier = tier;
    if (status) where.status = status;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
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
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total, limit, offset };
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
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
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.update({
      where: { id },
      data: dto as any,
      select: {
        id: true,
        username: true,
        email: true,
        tier: true,
        status: true,
        balance: true,
        avatarUrl: true,
      },
    });

    return user;
  }

  async listTiers() {
    const tiers = await this.prisma.tierConfig.findMany();
    return tiers.map((t) => ({
      ...t,
      features: JSON.parse(t.features),
    }));
  }

  async updateTier(tier: string, dto: UpdateTierDto) {
    const data: any = { ...dto };
    if (dto.features) {
      data.features = JSON.stringify(dto.features);
    }

    const updated = await this.prisma.tierConfig.update({
      where: { tier },
      data,
    });

    return {
      ...updated,
      features: JSON.parse(updated.features),
    };
  }

  async stats() {
    const [totalUsers, activeUsers, totalLicenses, tierDistribution, recentRegistrations] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { status: 'active' } }),
        this.prisma.license.count(),
        this.prisma.user.groupBy({
          by: ['tier'],
          _count: { tier: true },
        }),
        this.prisma.user.count({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 30 * 86400 * 1000),
            },
          },
        }),
      ]);

    return {
      totalUsers,
      activeUsers,
      totalLicenses,
      tierDistribution: tierDistribution.map((t) => ({
        tier: t.tier,
        count: t._count.tier,
      })),
      recentRegistrations,
    };
  }
}
