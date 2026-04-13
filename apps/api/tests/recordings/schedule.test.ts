import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScheduleProcessor } from '../../src/recordings/schedule.processor';

describe('ScheduleProcessor - Recording Schedules (D-03)', () => {
  let processor: ScheduleProcessor;
  let mockPrisma: any;
  let mockRecordingsService: any;

  beforeEach(() => {
    mockPrisma = {
      recordingSchedule: {
        findMany: vi.fn(),
      },
      camera: {
        findUnique: vi.fn(),
      },
    };

    mockRecordingsService = {
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
    };

    processor = new ScheduleProcessor(mockPrisma, mockRecordingsService);
  });

  it('starts recording at scheduled start time', async () => {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Schedule window that includes current time
    const startTime = currentTime;
    const endHour = (now.getHours() + 1) % 24;
    const endTime = `${String(endHour).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    mockPrisma.recordingSchedule.findMany.mockResolvedValue([
      {
        id: 'sched-1',
        orgId: 'org-1',
        cameraId: 'cam-1',
        scheduleType: 'daily',
        config: { startTime, endTime },
        enabled: true,
      },
    ]);
    mockPrisma.camera.findUnique.mockResolvedValue({
      isRecording: false,
      status: 'online',
    });
    mockRecordingsService.startRecording.mockResolvedValue({});

    await processor.process({ data: {} } as any);

    expect(mockRecordingsService.startRecording).toHaveBeenCalledWith('cam-1', 'org-1');
  });

  it('stops recording at scheduled end time', async () => {
    const now = new Date();
    // Schedule window that ended before current time
    const endHour = now.getHours();
    const startHour = (endHour - 2 + 24) % 24;
    const startTime = `${String(startHour).padStart(2, '0')}:00`;
    const endTime = `${String(endHour).padStart(2, '0')}:00`;
    const currentMinute = now.getMinutes();

    // Only test if we're past :00 of current hour (endTime already passed)
    if (currentMinute === 0) return;

    mockPrisma.recordingSchedule.findMany.mockResolvedValue([
      {
        id: 'sched-1',
        orgId: 'org-1',
        cameraId: 'cam-1',
        scheduleType: 'daily',
        config: { startTime, endTime },
        enabled: true,
      },
    ]);
    mockPrisma.camera.findUnique.mockResolvedValue({
      isRecording: true,
      status: 'online',
    });
    mockRecordingsService.stopRecording.mockResolvedValue({});

    await processor.process({ data: {} } as any);

    expect(mockRecordingsService.stopRecording).toHaveBeenCalledWith('cam-1', 'org-1');
  });

  it('skips disabled schedules', async () => {
    mockPrisma.recordingSchedule.findMany.mockResolvedValue([]);
    // The query itself filters enabled: true, so empty result means disabled are excluded

    await processor.process({ data: {} } as any);

    expect(mockRecordingsService.startRecording).not.toHaveBeenCalled();
    expect(mockRecordingsService.stopRecording).not.toHaveBeenCalled();
    expect(mockPrisma.recordingSchedule.findMany).toHaveBeenCalledWith({
      where: { enabled: true },
    });
  });

  it('handles daily schedule type with start/end times', async () => {
    // Use a fixed time window that definitely contains "now"
    const now = new Date();
    const hourBefore = (now.getHours() - 1 + 24) % 24;
    const hourAfter = (now.getHours() + 1) % 24;

    mockPrisma.recordingSchedule.findMany.mockResolvedValue([
      {
        id: 'sched-1',
        orgId: 'org-1',
        cameraId: 'cam-1',
        scheduleType: 'daily',
        config: {
          startTime: `${String(hourBefore).padStart(2, '0')}:00`,
          endTime: `${String(hourAfter).padStart(2, '0')}:00`,
        },
        enabled: true,
      },
    ]);
    mockPrisma.camera.findUnique.mockResolvedValue({
      isRecording: false,
      status: 'online',
    });
    mockRecordingsService.startRecording.mockResolvedValue({});

    await processor.process({ data: {} } as any);

    // Daily schedule should trigger start since we're in the window
    expect(mockRecordingsService.startRecording).toHaveBeenCalledWith('cam-1', 'org-1');
  });

  it('handles weekly schedule type with day-of-week filter', async () => {
    const now = new Date();
    const currentDay = now.getDay();
    // Use a day that is NOT today
    const wrongDay = (currentDay + 1) % 7;

    mockPrisma.recordingSchedule.findMany.mockResolvedValue([
      {
        id: 'sched-1',
        orgId: 'org-1',
        cameraId: 'cam-1',
        scheduleType: 'weekly',
        config: {
          startTime: '00:00',
          endTime: '23:59',
          days: [wrongDay],
        },
        enabled: true,
      },
    ]);

    await processor.process({ data: {} } as any);

    // Should skip because today's day doesn't match
    expect(mockRecordingsService.startRecording).not.toHaveBeenCalled();
    expect(mockPrisma.camera.findUnique).not.toHaveBeenCalled();
  });
});
