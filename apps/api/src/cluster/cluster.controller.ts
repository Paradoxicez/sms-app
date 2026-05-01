import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Req,
  UseGuards,
  BadRequestException,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiExcludeController } from '@nestjs/swagger';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { ClusterService } from './cluster.service';
import { CreateNodeSchema } from './dto/create-node.dto';
import { UpdateNodeSchema } from './dto/update-node.dto';
import { SrsApiService } from '../srs/srs-api.service';
import { Request } from 'express';

/** Convert BigInt fields to Number for JSON serialization */
function serializeNode(node: any) {
  if (!node) return node;
  return {
    ...node,
    bandwidth: node.bandwidth != null ? Number(node.bandwidth) : null,
  };
}

@ApiExcludeController()
@ApiTags('Cluster')
@Controller('api/cluster')
@UseGuards(AuthGuard, SuperAdminGuard)
export class ClusterController {
  private readonly logger = new Logger(ClusterController.name);

  constructor(
    private readonly clusterService: ClusterService,
    private readonly srsApiService: SrsApiService,
  ) {}

  @Get('nodes')
  @ApiOperation({ summary: 'List all cluster nodes' })
  @ApiResponse({ status: 200, description: 'Array of SrsNode records' })
  async findAll() {
    const nodes = await this.clusterService.findAll();
    return nodes.map(serializeNode);
  }

  @Get('nodes/:id')
  @ApiOperation({ summary: 'Get a cluster node by ID' })
  @ApiResponse({ status: 200, description: 'SrsNode record' })
  @ApiResponse({ status: 404, description: 'Node not found' })
  async findOne(@Param('id') id: string) {
    return serializeNode(await this.clusterService.findOne(id));
  }

  @Post('nodes')
  @ApiOperation({ summary: 'Create an edge node' })
  @ApiResponse({ status: 201, description: 'Edge node created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async create(@Req() req: Request) {
    const parsed = CreateNodeSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return serializeNode(await this.clusterService.create(parsed.data));
  }

  @Patch('nodes/:id')
  @ApiOperation({ summary: 'Update a cluster node' })
  @ApiResponse({ status: 200, description: 'Node updated' })
  async update(@Param('id') id: string, @Req() req: Request) {
    const parsed = UpdateNodeSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return serializeNode(await this.clusterService.update(id, parsed.data));
  }

  @Delete('nodes/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an edge node' })
  @ApiResponse({ status: 204, description: 'Node deleted' })
  @ApiResponse({ status: 400, description: 'Cannot delete origin node' })
  async remove(@Param('id') id: string) {
    await this.clusterService.remove(id);
  }

  @Post('nodes/:id/test')
  @ApiOperation({ summary: 'Test connection to a node' })
  @ApiResponse({ status: 200, description: 'Connection test result' })
  async testConnection(@Param('id') id: string) {
    const node = await this.clusterService.findOne(id);
    return this.clusterService.testConnection(node.apiUrl, node.role, node.hlsUrl);
  }

  @Post('nodes/:id/reload')
  @ApiOperation({ summary: 'Trigger config reload on a node' })
  @ApiResponse({ status: 200, description: 'Reload triggered' })
  async reload(@Param('id') id: string) {
    const node = await this.clusterService.findOne(id);

    if (node.role === 'ORIGIN') {
      await this.srsApiService.reloadConfig(node.apiUrl);
      return { success: true, message: 'SRS config reloaded' };
    } else {
      // Nginx reload via HTTP is not supported without an agent
      if (!node.isLocal) {
        this.logger.warn(
          `Cannot remotely reload nginx on non-local edge node ${node.name}. ` +
          `Deploy an agent or manually reload nginx.`,
        );
      }
      return {
        success: false,
        message: 'Nginx reload not supported via HTTP. Restart the edge container to apply config.',
      };
    }
  }
}
