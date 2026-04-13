import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/cluster-status',
  cors: { origin: '*' },
})
export class ClusterGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ClusterGateway.name);

  async handleConnection(client: Socket) {
    client.join('admin');
    this.logger.log(`Client ${client.id} joined admin room`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  broadcastNodeHealth(
    nodeId: string,
    data: {
      status: string;
      cpu: number | null;
      memory: number | null;
      bandwidth: string | null;
      viewers: number;
    },
  ) {
    this.server
      .to('admin')
      .emit('node:health', { nodeId, ...data, timestamp: new Date().toISOString() });
  }

  broadcastNodeStatus(nodeId: string, status: string) {
    this.server
      .to('admin')
      .emit('node:status', { nodeId, status, timestamp: new Date().toISOString() });
  }
}
