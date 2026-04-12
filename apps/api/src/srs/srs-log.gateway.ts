import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChildProcess, spawn } from 'child_process';
import { createInterface } from 'readline';

@WebSocketGateway({
  namespace: '/srs-logs',
  cors: { origin: '*' },
})
export class SrsLogGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(SrsLogGateway.name);
  private tailProcess: ChildProcess | null = null;
  private connectedClients = 0;

  // SRS log path — in Docker: /usr/local/srs/objs/srs.log
  // In dev: configurable via SRS_LOG_PATH env var
  private readonly logPath =
    process.env.SRS_LOG_PATH || '/usr/local/srs/objs/srs.log';

  async handleConnection(client: Socket) {
    // D-16: Super admin only check
    const role = client.handshake.query.role as string;
    if (role !== 'admin') {
      client.disconnect(true);
      return;
    }

    this.connectedClients++;
    client.join('srs-logs');
    this.logger.log(`Admin client connected to SRS logs: ${client.id}`);

    if (this.connectedClients === 1) {
      this.startTailing();
    }
  }

  handleDisconnect(client: Socket) {
    this.connectedClients = Math.max(0, this.connectedClients - 1);
    this.logger.log(
      `Client disconnected from SRS logs: ${client.id} (${this.connectedClients} remaining)`,
    );
    if (this.connectedClients === 0) {
      this.stopTailing();
    }
  }

  onModuleDestroy() {
    this.stopTailing();
  }

  private startTailing() {
    try {
      // Use tail -f -n 100 to get last 100 lines + follow
      this.tailProcess = spawn('tail', ['-f', '-n', '100', this.logPath]);

      const rl = createInterface({ input: this.tailProcess.stdout! });
      rl.on('line', (line: string) => {
        const level = this.parseLevel(line);
        this.server
          .to('srs-logs')
          .emit('srs:log', {
            line,
            level,
            timestamp: new Date().toISOString(),
          });
      });

      this.tailProcess.stderr?.on('data', (data: Buffer) => {
        this.logger.warn(`tail stderr: ${data.toString()}`);
        // If log file not found, notify clients
        this.server.to('srs-logs').emit('srs:log', {
          line: `[SRS Log] Log file not accessible: ${this.logPath}`,
          level: 'warn',
          timestamp: new Date().toISOString(),
        });
      });

      this.tailProcess.on('close', (code) => {
        this.logger.log(`tail process closed with code ${code}`);
        this.tailProcess = null;
      });

      this.logger.log(`Started tailing SRS log: ${this.logPath}`);
    } catch (err) {
      this.logger.error(`Failed to start tailing: ${err}`);
    }
  }

  private stopTailing() {
    if (this.tailProcess) {
      this.tailProcess.kill();
      this.tailProcess = null;
      this.logger.log('Stopped tailing SRS log');
    }
  }

  private parseLevel(line: string): string {
    // SRS log format: [2024-01-01 00:00:00.000][trace] message
    if (line.includes('[error]') || line.includes('[Error]')) return 'error';
    if (line.includes('[warn]') || line.includes('[Warn]')) return 'warn';
    return 'info';
  }
}
