import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SrsApiService {
  private readonly logger = new Logger(SrsApiService.name);
  private readonly baseUrl =
    process.env.SRS_API_URL || 'http://localhost:1985';

  async getVersions(nodeApiUrl?: string): Promise<any> {
    const url = nodeApiUrl || this.baseUrl;
    const res = await fetch(`${url}/api/v1/versions`);
    return res.json();
  }

  async getStreams(nodeApiUrl?: string): Promise<any> {
    const url = nodeApiUrl || this.baseUrl;
    const res = await fetch(`${url}/api/v1/streams`);
    return res.json();
  }

  async getSummaries(nodeApiUrl?: string): Promise<any> {
    const url = nodeApiUrl || this.baseUrl;
    const res = await fetch(`${url}/api/v1/summaries`);
    return res.json();
  }

  async getClients(nodeApiUrl?: string): Promise<any> {
    const url = nodeApiUrl || this.baseUrl;
    const res = await fetch(`${url}/api/v1/clients`);
    return res.json();
  }

  async reloadConfig(nodeApiUrl?: string): Promise<void> {
    const url = nodeApiUrl || this.baseUrl;
    await fetch(`${url}/api/v1/raw?rpc=reload`);
    this.logger.log(`SRS configuration reloaded on ${url}`);
  }
}
