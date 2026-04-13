import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SrsApiService } from '../srs/srs-api.service';
import { ClusterGateway } from './cluster.gateway';

const HEALTH_CHECK_INTERVAL_MS = 10_000; // 10 seconds per D-12
const OFFLINE_THRESHOLD = 3; // 3 missed checks -> OFFLINE per D-12
const FETCH_TIMEOUT_MS = 5_000;

@Injectable()
export class ClusterHealthService implements OnModuleInit {
  private readonly logger = new Logger(ClusterHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly srsApiService: SrsApiService,
    private readonly gateway: ClusterGateway,
    @InjectQueue('cluster-health') private readonly healthQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.startHealthChecks();
  }

  async checkNode(nodeId: string): Promise<void> {
    const node = await this.prisma.srsNode.findUnique({ where: { id: nodeId } });
    if (!node) {
      this.logger.warn(`Node ${nodeId} not found, skipping health check`);
      return;
    }

    const previousStatus = node.status;
    let success = false;
    let cpu: number | null = null;
    let memory: number | null = null;
    let bandwidth: bigint = BigInt(0);
    let viewers = 0;
    let uptime: number | null = null;
    let srsVersion: string | null = null;

    try {
      if (node.role === 'ORIGIN') {
        // Origin node: query SRS API
        const summaries = await this.srsApiService.getSummaries(node.apiUrl);
        cpu = summaries?.data?.self?.cpu_percent ?? null;
        memory = summaries?.data?.self?.mem_percent ?? null;
        bandwidth = BigInt(summaries?.data?.self?.srs_bytes_sent_total ?? 0);
        uptime = summaries?.data?.self?.srs_uptime ?? null;

        const clientsResult = await this.srsApiService.getClients(node.apiUrl);
        viewers = clientsResult?.clients?.length ?? 0;

        try {
          const versionResult = await this.srsApiService.getVersions(node.apiUrl);
          srsVersion = versionResult?.data?.version ?? null;
        } catch {
          // Version check is best-effort
        }
      } else {
        // Edge node (nginx): check /health and /nginx_status
        const healthRes = await fetch(`${node.hlsUrl}/health`, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!healthRes.ok) {
          throw new Error(`Edge health check returned ${healthRes.status}`);
        }

        try {
          const statusRes = await fetch(`${node.hlsUrl}/nginx_status`, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
          if (statusRes.ok) {
            const body = await statusRes.text();
            const match = body.match(/Active connections:\s*(\d+)/);
            if (match) {
              viewers = parseInt(match[1], 10);
            }
          }
        } catch {
          // nginx_status is best-effort
        }
      }

      success = true;
    } catch (error: any) {
      this.logger.warn(`Health check failed for node ${node.name} (${nodeId}): ${error.message}`);
    }

    if (success) {
      // Determine new status
      const newStatus =
        previousStatus === 'OFFLINE' || previousStatus === 'DEGRADED'
          ? 'ONLINE'
          : previousStatus === 'CONNECTING'
            ? 'ONLINE'
            : previousStatus; // stay ONLINE

      await this.prisma.srsNode.update({
        where: { id: nodeId },
        data: {
          cpu,
          memory,
          bandwidth,
          viewers,
          uptime,
          srsVersion,
          missedChecks: 0,
          lastHealthAt: new Date(),
          status: newStatus,
        },
      });

      // Broadcast health metrics
      this.gateway.broadcastNodeHealth(nodeId, {
        status: newStatus,
        cpu,
        memory,
        bandwidth: bandwidth.toString(),
        viewers,
      });

      // Broadcast status change only if changed
      if (newStatus !== previousStatus) {
        this.gateway.broadcastNodeStatus(nodeId, newStatus);
        this.logger.log(
          `Node ${node.name} status changed: ${previousStatus} -> ${newStatus}`,
        );
      }
    } else {
      // Failure path
      const newMissedChecks = node.missedChecks + 1;
      const newStatus =
        newMissedChecks >= OFFLINE_THRESHOLD ? 'OFFLINE' : 'DEGRADED';

      await this.prisma.srsNode.update({
        where: { id: nodeId },
        data: {
          missedChecks: newMissedChecks,
          status: newStatus,
        },
      });

      // Broadcast health with null metrics
      this.gateway.broadcastNodeHealth(nodeId, {
        status: newStatus,
        cpu: null,
        memory: null,
        bandwidth: null,
        viewers: 0,
      });

      // Broadcast status change only if changed
      if (newStatus !== previousStatus) {
        this.gateway.broadcastNodeStatus(nodeId, newStatus);
        this.logger.log(
          `Node ${node.name} status changed: ${previousStatus} -> ${newStatus}`,
        );
      }
    }
  }

  async startHealthChecks(): Promise<void> {
    const nodes = await this.prisma.srsNode.findMany();
    for (const node of nodes) {
      await this.addHealthCheck(node.id);
    }
    this.logger.log(`Started health checks for ${nodes.length} nodes`);
  }

  async addHealthCheck(nodeId: string): Promise<void> {
    await this.healthQueue.add(
      `health-${nodeId}`,
      { nodeId },
      {
        repeat: { every: HEALTH_CHECK_INTERVAL_MS },
        removeOnComplete: true,
        removeOnFail: 10,
      },
    );
  }

  async removeHealthCheck(nodeId: string): Promise<void> {
    const jobs = await this.healthQueue.getRepeatableJobs();
    const job = jobs.find((j: any) => j.name === `health-${nodeId}`);
    if (job) {
      await this.healthQueue.removeRepeatable(`health-${nodeId}`, {
        every: HEALTH_CHECK_INTERVAL_MS,
      });
      this.logger.log(`Removed health check for node ${nodeId}`);
    }
  }
}
