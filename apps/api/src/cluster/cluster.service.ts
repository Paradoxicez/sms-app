import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SrsApiService } from '../srs/srs-api.service';
import { CreateNodeDto } from './dto/create-node.dto';
import { UpdateNodeDto } from './dto/update-node.dto';

@Injectable()
export class ClusterService implements OnModuleInit {
  private readonly logger = new Logger(ClusterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly srsApiService: SrsApiService,
  ) {}

  async onModuleInit(): Promise<void> {
    const existingOrigin = await this.prisma.srsNode.findFirst({
      where: { role: 'ORIGIN' },
    });

    if (!existingOrigin) {
      const apiUrl = process.env.SRS_API_URL || 'http://srs:1985';
      const hlsUrl = process.env.SRS_HLS_URL || 'http://srs:8080';

      await this.prisma.srsNode.create({
        data: {
          name: 'Primary Origin',
          role: 'ORIGIN',
          status: 'ONLINE',
          apiUrl,
          hlsUrl,
          isLocal: true,
        },
      });

      this.logger.log('Auto-registered primary origin node');
    }
  }

  async findAll() {
    return this.prisma.srsNode.findMany({
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const node = await this.prisma.srsNode.findUnique({ where: { id } });
    if (!node) {
      throw new NotFoundException(`Node ${id} not found`);
    }
    return node;
  }

  async create(dto: CreateNodeDto) {
    return this.prisma.srsNode.create({
      data: {
        name: dto.name,
        role: 'EDGE',
        status: 'CONNECTING',
        apiUrl: dto.apiUrl,
        hlsUrl: dto.hlsUrl,
        hlsPort: dto.hlsPort ?? 8080,
        isLocal: dto.isLocal ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateNodeDto) {
    await this.findOne(id); // throws if not found
    return this.prisma.srsNode.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    const node = await this.findOne(id);
    if (node.role === 'ORIGIN') {
      throw new BadRequestException('Cannot delete origin node');
    }
    return this.prisma.srsNode.delete({ where: { id } });
  }

  async testConnection(
    apiUrl: string,
    role: 'ORIGIN' | 'EDGE',
    hlsUrl?: string,
  ): Promise<{ success: boolean; version?: string; error?: string }> {
    try {
      if (role === 'ORIGIN') {
        const result = await this.srsApiService.getVersions(apiUrl);
        return {
          success: true,
          version: result?.data?.version || result?.server,
        };
      } else {
        // Edge nodes use nginx -- check health endpoint
        const healthUrl = hlsUrl || apiUrl;
        const res = await fetch(`${healthUrl}/health`);
        return { success: res.ok };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getOnlineEdges() {
    return this.prisma.srsNode.findMany({
      where: { role: 'EDGE', status: 'ONLINE' },
    });
  }

  async getLeastLoadedEdge() {
    return this.prisma.srsNode.findFirst({
      where: { role: 'EDGE', status: 'ONLINE' },
      orderBy: { viewers: 'asc' },
    });
  }

  async incrementConfigVersion(): Promise<void> {
    await this.prisma.srsNode.updateMany({
      data: { configVersion: { increment: 1 } },
    });
  }
}
