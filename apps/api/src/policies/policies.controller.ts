import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PoliciesService } from './policies.service';
import { CreatePolicySchema } from './dto/create-policy.dto';
import { UpdatePolicySchema } from './dto/update-policy.dto';

@ApiTags('Policies')
@Controller('api/policies')
@UseGuards(AuthGuard)
export class PoliciesController {
  constructor(
    private readonly policiesService: PoliciesService,
    private readonly cls: ClsService,
  ) {}

  private getOrgId(): string {
    const orgId = this.cls.get('ORG_ID');
    if (!orgId) {
      throw new BadRequestException('No active organization');
    }
    return orgId;
  }

  @Post()
  @ApiOperation({ summary: 'Create a playback policy' })
  @ApiResponse({ status: 201, description: 'Policy created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async create(@Body() body: unknown) {
    const result = CreatePolicySchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.policiesService.create(this.getOrgId(), result.data);
  }

  @Get()
  @ApiOperation({ summary: 'List all policies for the organization' })
  @ApiResponse({ status: 200, description: 'List of policies' })
  async findAll() {
    return this.policiesService.findAll(this.getOrgId());
  }

  @Get('resolve/:cameraId')
  @ApiOperation({ summary: 'Resolve effective policy for a camera' })
  @ApiResponse({ status: 200, description: 'Resolved policy with inheritance chain' })
  @ApiParam({ name: 'cameraId', description: 'Camera ID' })
  async resolve(@Param('cameraId') cameraId: string) {
    return this.policiesService.resolve(cameraId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a policy by ID' })
  @ApiResponse({ status: 200, description: 'Policy details' })
  @ApiResponse({ status: 404, description: 'Policy not found' })
  @ApiParam({ name: 'id', description: 'Policy ID' })
  async findOne(@Param('id') id: string) {
    return this.policiesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a policy' })
  @ApiResponse({ status: 200, description: 'Policy updated' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiParam({ name: 'id', description: 'Policy ID' })
  async update(@Param('id') id: string, @Body() body: unknown) {
    const result = UpdatePolicySchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.policiesService.update(id, result.data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a policy' })
  @ApiResponse({ status: 200, description: 'Policy deleted' })
  @ApiResponse({ status: 404, description: 'Policy not found' })
  @ApiParam({ name: 'id', description: 'Policy ID' })
  async remove(@Param('id') id: string) {
    return this.policiesService.remove(id);
  }
}
