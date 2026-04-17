import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { createWriteStream } from 'fs';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import archiver from 'archiver';
import { MinioService } from './minio.service';
import { RecordingsService } from './recordings.service';

export interface BulkDownloadJob {
  zipPath: string;
  filename: string;
  size: number;
  createdAt: number;
}

@Injectable()
export class BulkDownloadService {
  private readonly logger = new Logger(BulkDownloadService.name);
  private readonly jobs = new Map<string, BulkDownloadJob>();
  private readonly tmpDir = '/tmp/sms-bulk-downloads';

  constructor(
    private readonly recordingsService: RecordingsService,
    private readonly minioService: MinioService,
  ) {
    this.cleanupOldJobs();
  }

  async processJob(
    ids: string[],
    orgId: string,
    onProgress: (current: number, total: number, name: string) => void,
  ): Promise<{ jobId: string; filename: string; size: number }> {
    await mkdir(this.tmpDir, { recursive: true });
    const jobId = randomUUID();
    const jobDir = join(this.tmpDir, jobId);
    await mkdir(jobDir);

    const total = ids.length;
    const mp4Files: { path: string; name: string }[] = [];

    for (let i = 0; i < ids.length; i++) {
      const recording = await this.recordingsService.getRecordingWithSegments(ids[i], orgId);
      if (recording.segments.length === 0) continue;

      const cameraName = (recording.camera?.name ?? 'recording').replace(/[^a-zA-Z0-9_-]/g, '_');
      const dateStr = new Date(recording.startedAt).toISOString().slice(0, 10);
      const timeStr = new Date(recording.startedAt).toISOString().slice(11, 16).replace(':', '');
      const mp4Name = `${cameraName}-${dateStr}-${timeStr}.mp4`;

      onProgress(i + 1, total, mp4Name);

      const mp4Path = join(jobDir, mp4Name);
      await this.remuxToMp4(recording, orgId, mp4Path);
      mp4Files.push({ path: mp4Path, name: mp4Name });
    }

    const zipFilename = `recordings-${new Date().toISOString().slice(0, 10)}.zip`;
    const zipPath = join(this.tmpDir, `${jobId}.zip`);

    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 1 } });

      output.on('close', () => resolve());
      archive.on('error', (err) => reject(err));

      archive.pipe(output);
      for (const file of mp4Files) {
        archive.file(file.path, { name: file.name });
      }
      archive.finalize();
    });

    const { stat } = await import('fs/promises');
    const zipStat = await stat(zipPath);

    this.jobs.set(jobId, {
      zipPath,
      filename: zipFilename,
      size: zipStat.size,
      createdAt: Date.now(),
    });

    // Cleanup temp MP4 files
    for (const file of mp4Files) {
      await unlink(file.path).catch(() => {});
    }
    const { rmdir } = await import('fs/promises');
    await rmdir(jobDir).catch(() => {});

    return { jobId, filename: zipFilename, size: zipStat.size };
  }

  getJob(jobId: string): BulkDownloadJob | undefined {
    return this.jobs.get(jobId);
  }

  async cleanupJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      await unlink(job.zipPath).catch(() => {});
      this.jobs.delete(jobId);
    }
  }

  private async remuxToMp4(
    recording: any,
    orgId: string,
    outputPath: string,
  ): Promise<void> {
    const sortedSegments = recording.segments.sort((a: any, b: any) => a.seqNo - b.seqNo);

    let m3u8 = '#EXTM3U\n#EXT-X-VERSION:7\n';
    m3u8 += '#EXT-X-TARGETDURATION:3\n';
    m3u8 += '#EXT-X-MEDIA-SEQUENCE:0\n';
    m3u8 += '#EXT-X-PLAYLIST-TYPE:VOD\n';

    if (recording.initSegment) {
      const initUrl = await this.minioService.getPresignedUrl(orgId, recording.initSegment, 3600);
      m3u8 += `#EXT-X-MAP:URI="${initUrl}"\n`;
    }

    for (const segment of sortedSegments) {
      const segUrl = await this.minioService.getPresignedUrl(orgId, segment.objectPath, 3600);
      m3u8 += `#EXTINF:${segment.duration?.toFixed(6) ?? '2.560000'},\n`;
      m3u8 += `${segUrl}\n`;
    }
    m3u8 += '#EXT-X-ENDLIST\n';

    const m3u8Path = `${outputPath}.m3u8`;
    await writeFile(m3u8Path, m3u8);

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-protocol_whitelist', 'file,http,https,tcp,tls,crypto',
        '-i', m3u8Path,
        '-c', 'copy',
        '-movflags', 'frag_keyframe+empty_moov',
        '-f', 'mp4',
        outputPath,
      ], { stdio: ['pipe', 'pipe', 'pipe'] });

      ffmpeg.on('close', async (code) => {
        await unlink(m3u8Path).catch(() => {});
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });

      ffmpeg.on('error', async (err) => {
        await unlink(m3u8Path).catch(() => {});
        reject(err);
      });
    });
  }

  private cleanupOldJobs() {
    setInterval(() => {
      const now = Date.now();
      for (const [jobId, job] of this.jobs.entries()) {
        if (now - job.createdAt > 10 * 60 * 1000) {
          this.cleanupJob(jobId);
        }
      }
    }, 60_000);
  }
}
