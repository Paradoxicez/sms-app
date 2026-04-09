import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { SrsApiService } from '../srs/srs-api.service';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { UpdateOrgSettingsDto } from './dto/update-org-settings.dto';

interface SystemSettingsConfig {
  hlsFragment: number;
  hlsWindow: number;
  hlsEncryption: boolean;
  rtmpPort: number;
  httpPort: number;
  apiPort: number;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly srsApiService: SrsApiService,
  ) {}

  // ─── System Settings ───────────────────────────

  async getSystemSettings() {
    let settings = await this.prisma.systemSettings.findFirst();
    if (!settings) {
      settings = await this.prisma.systemSettings.create({ data: {} });
      this.logger.log('Created default system settings');
    }
    return settings;
  }

  async updateSystemSettings(dto: UpdateSystemSettingsDto) {
    const existing = await this.getSystemSettings();
    const updated = await this.prisma.systemSettings.update({
      where: { id: existing.id },
      data: dto,
    });

    await this.regenerateAndReloadSrs();

    return updated;
  }

  // ─── Org Settings ─────────────────────────────

  async getOrgSettings(orgId: string) {
    let settings = await this.prisma.orgSettings.findUnique({
      where: { orgId },
    });
    if (!settings) {
      settings = await this.prisma.orgSettings.create({
        data: { orgId },
      });
      this.logger.log(`Created default org settings for ${orgId}`);
    }
    return settings;
  }

  async updateOrgSettings(orgId: string, dto: UpdateOrgSettingsDto) {
    return this.prisma.orgSettings.upsert({
      where: { orgId },
      update: dto,
      create: { orgId, ...dto },
    });
  }

  // ─── SRS Config Generation ────────────────────

  generateSrsConfig(settings: SystemSettingsConfig): string {
    const hlsKeysBlock = settings.hlsEncryption
      ? `        hls_keys        on;
        hls_fragments_per_key 10;
        hls_key_file    [app]/[stream]-[seq].key;
        hls_key_file_path /usr/local/srs/objs/nginx/html;
        hls_key_url     /keys/[app]/[stream]-[seq].key;\n`
      : '';

    return `listen              ${settings.rtmpPort};
max_connections     1000;
daemon              off;
srs_log_tank        console;

http_server {
    enabled         on;
    listen          ${settings.httpPort};
}

http_api {
    enabled         on;
    listen          ${settings.apiPort};
}

stats {
    network         0;
}

vhost __defaultVhost__ {
    hls {
        enabled         on;
        hls_fragment    ${settings.hlsFragment};
        hls_window      ${settings.hlsWindow};
        hls_cleanup     on;
        hls_dispose     30;
        hls_wait_keyframe on;
        hls_use_fmp4    on;
${hlsKeysBlock}    }

    http_hooks {
        enabled         on;
        on_publish      http://api:3001/api/srs/callbacks/on-publish;
        on_unpublish    http://api:3001/api/srs/callbacks/on-unpublish;
        on_play         http://api:3001/api/srs/callbacks/on-play;
        on_stop         http://api:3001/api/srs/callbacks/on-stop;
        on_hls          http://api:3001/api/srs/callbacks/on-hls;
        on_dvr          http://api:3001/api/srs/callbacks/on-dvr;
    }

    rtc {
        enabled     on;
        rtmp_to_rtc on;
    }
}
`;
  }

  async regenerateAndReloadSrs(): Promise<void> {
    const settings = await this.getSystemSettings();

    const config = this.generateSrsConfig({
      hlsFragment: settings.hlsFragment,
      hlsWindow: settings.hlsWindow,
      hlsEncryption: settings.hlsEncryption,
      rtmpPort: settings.rtmpPort,
      httpPort: settings.httpPort,
      apiPort: settings.apiPort,
    });

    const configPath =
      process.env.SRS_CONFIG_PATH || join(process.cwd(), '..', '..', 'config', 'srs.conf');

    writeFileSync(configPath, config, 'utf-8');
    this.logger.log(`srs.conf regenerated at ${configPath}`);

    try {
      await this.srsApiService.reloadConfig();
      this.logger.log('SRS configuration reloaded successfully');
    } catch (error) {
      this.logger.warn('Failed to reload SRS config (SRS may not be running)', error);
    }
  }
}
