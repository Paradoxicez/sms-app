import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { CodecInfo } from '../cameras/types/codec-info';

@WebSocketGateway({
  namespace: '/camera-status',
  cors: { origin: '*' },
})
export class StatusGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(StatusGateway.name);

  async handleConnection(client: Socket) {
    const orgId = client.handshake.query.orgId as string;
    if (orgId) {
      client.join(`org:${orgId}`);
      this.logger.log(`Client ${client.id} joined org:${orgId}`);
    }

    const userId = client.handshake.query.userId as string;
    if (userId) {
      client.join(`user:${userId}`);
      this.logger.log(`Client ${client.id} joined user:${userId}`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  broadcastStatus(orgId: string, cameraId: string, status: string) {
    this.server
      .to(`org:${orgId}`)
      .emit('camera:status', { cameraId, status, timestamp: new Date().toISOString() });
  }

  broadcastViewerCount(orgId: string, cameraId: string, count: number) {
    this.server
      .to(`org:${orgId}`)
      .emit('camera:viewers', { cameraId, count });
  }

  /**
   * Phase 19 follow-up: push CodecInfo updates to subscribed clients so the
   * codec column auto-updates without a page refresh. Called by
   * StreamProbeProcessor after each codecInfo write (pending → success/failed).
   */
  broadcastCodecInfo(orgId: string, cameraId: string, codecInfo: CodecInfo) {
    this.server
      .to(`org:${orgId}`)
      .emit('camera:codec-info', {
        cameraId,
        codecInfo,
        timestamp: new Date().toISOString(),
      });
  }
}
