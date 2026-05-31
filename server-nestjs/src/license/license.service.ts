import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivateDto } from './dto/activate.dto';
import { VerifyDto } from './dto/verify.dto';

@Injectable()
export class LicenseService {
  constructor(private prisma: PrismaService) {}

  async activate(dto: ActivateDto, authUserId?: string) {
    const { licenseKey, deviceId, userId } = dto;
    const effectiveUserId = authUserId || userId;

    const license = await this.prisma.license.findUnique({
      where: { licenseKey },
    });

    if (!license || license.status !== 'active') {
      throw new NotFoundException('Invalid or inactive license key');
    }

    const deviceCount = await this.prisma.activation.count({
      where: { licenseKey, revoked: false },
    });

    const existingForDevice = await this.prisma.activation.findUnique({
      where: {
        licenseKey_deviceFingerprint: {
          licenseKey,
          deviceFingerprint: deviceId,
        },
      },
    });

    if (!existingForDevice && deviceCount >= license.maxDevices) {
      throw new ForbiddenException(
        `Device limit reached (${license.maxDevices}). Please deactivate a device first.`,
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + license.durationDays * 86400 * 1000);

    if (existingForDevice) {
      await this.prisma.activation.update({
        where: { id: existingForDevice.id },
        data: {
          lastVerifiedAt: now,
          expiresAt,
          userId: effectiveUserId ?? null,
        },
      });
    } else {
      await this.prisma.activation.create({
        data: {
          licenseKey,
          deviceFingerprint: deviceId,
          userId: effectiveUserId ?? null,
          tier: license.tier,
          activatedAt: now,
          expiresAt,
          lastVerifiedAt: now,
        },
      });

      await this.prisma.license.update({
        where: { id: license.id },
        data: { activatedCount: { increment: 1 } },
      });
    }

    return {
      tier: license.tier,
      expiresAt: Math.floor(expiresAt.getTime() / 1000),
    };
  }

  async verify(dto: VerifyDto) {
    const { licenseKey, deviceId } = dto;

    const activation = await this.prisma.activation.findUnique({
      where: {
        licenseKey_deviceFingerprint: {
          licenseKey,
          deviceFingerprint: deviceId,
        },
      },
      include: { license: true },
    });

    if (!activation || activation.revoked) {
      throw new NotFoundException('No active activation found for this key and device');
    }

    if (activation.license.status !== 'active') {
      throw new ForbiddenException('License has been revoked or expired');
    }

    const now = Math.floor(Date.now() / 1000);
    if (activation.expiresAt && activation.expiresAt.getTime() / 1000 <= now) {
      throw new ForbiddenException('License activation has expired');
    }

    await this.prisma.activation.update({
      where: { id: activation.id },
      data: { lastVerifiedAt: new Date() },
    });

    const signature = this.generateSignature(
      licenseKey,
      deviceId,
      activation.tier,
    );

    return {
      tier: activation.tier,
      expiresAt: activation.expiresAt
        ? Math.floor(activation.expiresAt.getTime() / 1000)
        : null,
      signature,
    };
  }

  private generateSignature(
    licenseKey: string,
    deviceId: string,
    tier: string,
  ): string {
    const data = `${licenseKey}:${deviceId}:${tier}:${Math.floor(Date.now() / 1000)}`;
    const key = process.env.ADMIN_API_KEY || 'dev-admin-key';
    return require('crypto')
      .createHmac('sha256', key)
      .update(data)
      .digest('base64');
  }
}
