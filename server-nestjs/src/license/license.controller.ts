import { Controller, Post, Body, Headers } from '@nestjs/common';
import { LicenseService } from './license.service';
import { ActivateDto } from './dto/activate.dto';
import { VerifyDto } from './dto/verify.dto';

@Controller('license')
export class LicenseController {
  constructor(private licenseService: LicenseService) {}

  @Post('activate')
  async activate(
    @Body() dto: ActivateDto,
    @Headers('authorization') auth?: string,
  ) {
    let userId: string | undefined;
    if (auth) {
      try {
        const token = auth.replace('Bearer ', '').trim();
        const payload = require('jsonwebtoken').decode(token);
        if (payload?.sub) userId = payload.sub;
      } catch {}
    }
    return this.licenseService.activate(dto, userId);
  }

  @Post('verify')
  async verify(@Body() dto: VerifyDto) {
    return this.licenseService.verify(dto);
  }
}
