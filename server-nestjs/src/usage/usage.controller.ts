import { Controller, Get, Post, Query, Body, UseGuards, Req } from '@nestjs/common';
import { UsageService } from './usage.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('usage')
export class UsageController {
  constructor(private usageService: UsageService) {}

  @Get('check')
  @UseGuards(JwtAuthGuard)
  async check(
    @Query('feature') feature: string,
    @Req() req: any,
  ) {
    return this.usageService.check(feature, req.user.userId);
  }

  @Post('record')
  @UseGuards(JwtAuthGuard)
  async record(
    @Body('feature') feature: string,
    @Req() req: any,
  ) {
    return this.usageService.record(feature, req.user.userId);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  async stats(
    @Query('yearMonth') yearMonth: string,
    @Req() req: any,
  ) {
    return this.usageService.stats(req.user.userId, yearMonth);
  }
}
