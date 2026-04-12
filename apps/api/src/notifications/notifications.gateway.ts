import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { getAuth } from '../auth/auth.config';

@WebSocketGateway({
  namespace: '/notifications',
  cors: { origin: '*' },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(NotificationsGateway.name);

  async handleConnection(client: Socket) {
    const headers = new Headers();
    const rawHeaders = client.handshake.headers;
    for (const [key, value] of Object.entries(rawHeaders)) {
      if (typeof value === 'string') {
        headers.set(key, value);
      }
    }

    try {
      const auth = getAuth();
      const session = await auth.api.getSession({ headers });
      if (!session?.user?.id) {
        this.logger.warn(`Unauthenticated WebSocket connection rejected: ${client.id}`);
        client.disconnect(true);
        return;
      }

      const userId = session.user.id;
      client.join(`user:${userId}`);
      this.logger.log(`Client ${client.id} joined user:${userId} (session-verified)`);
    } catch (err) {
      this.logger.warn(`Session validation failed for ${client.id}: ${err}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  sendToUser(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notification:new', notification);
  }
}
