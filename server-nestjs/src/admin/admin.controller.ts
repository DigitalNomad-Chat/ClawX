import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Query,
  Body,
  Param,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AdminService } from './admin.service';
import { CaptchaService } from './captcha.service';
import { AdminGuard } from './admin.guard';
import { CreateLicenseDto } from './dto/create-license.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateTierDto } from './dto/update-tier.dto';

@Controller('admin')
export class AdminController {
  constructor(
    private adminService: AdminService,
    private captchaService: CaptchaService,
  ) {}

  @Get('captcha')
  async getCaptcha() {
    return this.captchaService.generate();
  }

  @Post('login')
  async login(
    @Body() body: { username: string; password: string; captchaId: string; captchaCode: string },
  ) {
    return this.adminService.login(
      body.username,
      body.password,
      body.captchaId,
      body.captchaCode,
      this.captchaService,
    );
  }

  @Post('licenses')
  @UseGuards(AdminGuard)
  async createLicense(@Body() dto: CreateLicenseDto) {
    return this.adminService.createLicense(dto);
  }

  @Get('licenses')
  @UseGuards(AdminGuard)
  async listLicenses(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.listLicenses(
      Math.min(parseInt(limit || '50'), 100),
      parseInt(offset || '0'),
      status,
    );
  }

  @Delete('licenses/:key')
  @UseGuards(AdminGuard)
  async revokeLicense(@Param('key') key: string) {
    return this.adminService.revokeLicense(key);
  }

  @Get('users')
  @UseGuards(AdminGuard)
  async listUsers(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('tier') tier?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.listUsers(
      Math.min(parseInt(limit || '50'), 100),
      parseInt(offset || '0'),
      tier,
      status,
    );
  }

  @Get('users/:id')
  @UseGuards(AdminGuard)
  async getUser(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }

  @Patch('users/:id')
  @UseGuards(AdminGuard)
  async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.adminService.updateUser(id, dto);
  }

  @Get('tiers')
  @UseGuards(AdminGuard)
  async listTiers() {
    return this.adminService.listTiers();
  }

  @Patch('tiers/:tier')
  @UseGuards(AdminGuard)
  async updateTier(@Param('tier') tier: string, @Body() dto: UpdateTierDto) {
    return this.adminService.updateTier(tier, dto);
  }

  @Get('stats')
  @UseGuards(AdminGuard)
  async stats() {
    return this.adminService.stats();
  }
}
