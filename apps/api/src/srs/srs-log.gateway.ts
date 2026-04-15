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
import { getAuth } from '../auth/auth.config';

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

  // SRS is configured with `srs_log_tank console` (see config/srs.conf), so
  // there is no log file on disk — logs go to container stdout. Tail via
  // `docker logs -f <container>` by default; override with SRS_LOG_PATH to
  // point at a file if a future deployment writes one.
  private readonly logPath = process.env.SRS_LOG_PATH || '';
  private readonly logContainer =
    process.env.SRS_LOG_CONTAINER || 'sms-app-srs-1';

  async handleConnection(client: Socket) {
    // D-16: Super admin only — validate from session, not client query params
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
      if (!session?.user?.role || session.user.role !== 'admin') {
        client.disconnect(true);
        return;
      }
    } catch {
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
      if (this.logPath) {
        // File mode — if someone sets SRS_LOG_PATH to a shared-volume file.
        this.tailProcess = spawn('tail', ['-f', '-n', '100', this.logPath]);
      } else {
        // Default: follow container stdout via `docker logs -f`.
        // --tail=100 mirrors the file-mode `-n 100`.
        this.tailProcess = spawn('docker', [
          'logs',
          '-f',
          '--tail=100',
          this.logContainer,
        ]);
      }

      const source = this.logPath
        ? `file ${this.logPath}`
        : `container ${this.logContainer}`;

      // SRS writes to stderr too (it splits info/error streams), so forward both.
      const emit = (line: string, fallbackLevel: string | null = null) => {
        const level = fallbackLevel ?? this.parseLevel(line);
        this.server.to('srs-logs').emit('srs:log', {
          line,
          level,
          timestamp: new Date().toISOString(),
        });
      };

      const rlOut = createInterface({ input: this.tailProcess.stdout! });
      rlOut.on('line', (line: string) => emit(line));

      if (this.tailProcess.stderr) {
        const rlErr = createInterface({ input: this.tailProcess.stderr });
        rlErr.on('line', (line: string) => {
          // docker logs prefixes some diagnostic lines to stderr (e.g. "no such
          // container"). Forward them so operators see the failure reason
          // instead of silent nothingness.
          emit(line);
        });
      }

      this.tailProcess.on('close', (code) => {
        this.logger.log(
          `log tail process (${source}) closed with code ${code}`,
        );
        this.tailProcess = null;
      });

      this.tailProcess.on('error', (err) => {
        this.logger.error(
          `Failed to spawn log tail process (${source}): ${err.message}`,
        );
        emit(
          `[SRS Log] Could not start log stream from ${source}: ${err.message}`,
          'error',
        );
      });

      this.logger.log(`Started tailing SRS logs from ${source}`);
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
