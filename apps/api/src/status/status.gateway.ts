import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

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
}
