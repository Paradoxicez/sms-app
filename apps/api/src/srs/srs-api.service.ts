import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SrsApiService {
  private readonly logger = new Logger(SrsApiService.name);
  private readonly baseUrl =
    process.env.SRS_API_URL || 'http://localhost:1985';

  async getVersions(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/versions`);
    return res.json();
  }

  async getStreams(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/streams`);
    return res.json();
  }

  async getSummaries(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/summaries`);
    return res.json();
  }

  async getClients(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/clients`);
    return res.json();
  }

  async reloadConfig(): Promise<void> {
    await fetch(`${this.baseUrl}/api/v1/raw?rpc=reload`);
    this.logger.log('SRS configuration reloaded');
  }
}
