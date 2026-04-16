import { Inject, Injectable, Logger } from '@nestjs/common';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
import { SrsApiService } from '../srs/srs-api.service';
import { ClusterService } from '../cluster/cluster.service';
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
    @Inject(TENANCY_CLIENT) private readonly prisma: any,
    private readonly srsApiService: SrsApiService,
    private readonly clusterService: ClusterService,
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
        hls_ctx         on;
        hls_ts_ctx      on;
        hls_use_fmp4    on;
${hlsKeysBlock}    }

    http_hooks {
        enabled         on;
        on_publish      http://${process.env.SRS_CALLBACK_HOST || 'host.docker.internal'}:${process.env.SRS_CALLBACK_PORT || '3003'}/api/srs/callbacks/on-publish;
        on_unpublish    http://${process.env.SRS_CALLBACK_HOST || 'host.docker.internal'}:${process.env.SRS_CALLBACK_PORT || '3003'}/api/srs/callbacks/on-unpublish;
        on_play         http://${process.env.SRS_CALLBACK_HOST || 'host.docker.internal'}:${process.env.SRS_CALLBACK_PORT || '3003'}/api/srs/callbacks/on-play;
        on_stop         http://${process.env.SRS_CALLBACK_HOST || 'host.docker.internal'}:${process.env.SRS_CALLBACK_PORT || '3003'}/api/srs/callbacks/on-stop;
        on_hls          http://${process.env.SRS_CALLBACK_HOST || 'host.docker.internal'}:${process.env.SRS_CALLBACK_PORT || '3003'}/api/srs/callbacks/on-hls;
        on_dvr          http://${process.env.SRS_CALLBACK_HOST || 'host.docker.internal'}:${process.env.SRS_CALLBACK_PORT || '3003'}/api/srs/callbacks/on-dvr;
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

    // Reload origin SRS
    try {
      await this.srsApiService.reloadConfig();
      this.logger.log('SRS origin configuration reloaded successfully');
    } catch (error) {
      this.logger.warn('Failed to reload SRS origin config (SRS may not be running)', error);
    }

    // Propagate config change to all edge nodes (per D-07)
    try {
      const edges = await this.clusterService.getOnlineEdges();
      for (const edge of edges) {
        try {
          // Edge nginx proxies to origin -- config changes affect origin only.
          // Log that edge will pick up changes via origin.
          this.logger.log(`Edge node ${edge.name} will pick up config changes via origin`);
        } catch (err) {
          this.logger.warn(`Failed to notify edge ${edge.name}`, err);
        }
      }
      // Increment configVersion on all nodes to signal config change
      await this.clusterService.incrementConfigVersion();
    } catch (error) {
      this.logger.warn('Failed to propagate config to edges', error);
    }
  }
}
