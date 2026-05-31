import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsageService {
  constructor(private prisma: PrismaService) {}

  async check(feature: string, userId: string) {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const tierConfig = await this.prisma.tierConfig.findUnique({
      where: { tier: (await this.prisma.user.findUnique({ where: { id: userId } }))?.tier || 'free' },
    });

    const usage = await this.prisma.usage.findUnique({
      where: {
        userId_feature_yearMonth: {
          userId,
          feature,
          yearMonth,
        },
      },
    });

    const usedCount = usage?.usedCount ?? 0;
    const monthlyQuota = tierConfig?.monthlyQuota ?? 0;
    const features: string[] = tierConfig ? JSON.parse(tierConfig.features) : [];
    const hasFeature = features.includes(feature);

    return {
      feature,
      yearMonth,
      usedCount,
      monthlyQuota,
      hasFeature,
      unlimited: monthlyQuota === 0,
      remaining: monthlyQuota === 0 ? null : Math.max(0, monthlyQuota - usedCount),
    };
  }

  async record(feature: string, userId: string) {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    await this.prisma.usage.upsert({
      where: {
        userId_feature_yearMonth: {
          userId,
          feature,
          yearMonth,
        },
      },
      update: {
        usedCount: { increment: 1 },
      },
      create: {
        userId,
        feature,
        yearMonth,
        usedCount: 1,
      },
    });

    return { success: true, feature, yearMonth };
  }

  async stats(userId: string, yearMonth?: string) {
    const where: any = { userId };
    if (yearMonth) {
      where.yearMonth = yearMonth;
    }

    const stats = await this.prisma.usage.findMany({
      where,
      orderBy: [{ yearMonth: 'desc' }, { feature: 'asc' }],
      select: {
        feature: true,
        yearMonth: true,
        usedCount: true,
      },
    });

    return { stats };
  }
}
