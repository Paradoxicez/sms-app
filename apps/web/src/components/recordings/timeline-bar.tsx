'use client';

import { useCallback, useRef, useState } from 'react';

export interface TimelineHourData {
  hour: number;
  hasData: boolean;
}

interface TimelineBarProps {
  hours: TimelineHourData[];
  selectedRange: { start: number; end: number } | null;
  onRangeSelect: (start: number, end: number) => void;
  onSeek: (hour: number) => void;
}

const HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

function formatHour(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function formatDuration(start: number, end: number): string {
  const diff = end - start;
  const hours = Math.floor(diff);
  const minutes = Math.round((diff - hours) * 60);
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function TimelineBar({
  hours,
  selectedRange,
  onRangeSelect,
  onSeek,
}: TimelineBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const isDragging = useRef(false);

  const getHourFromEvent = useCallback(
    (e: React.MouseEvent) => {
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      return (x / rect.width) * 24;
    },
    [],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const hour = getHourFromEvent(e);
      isDragging.current = true;
      setDragStart(hour);
      setDragEnd(hour);
    },
    [getHourFromEvent],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging.current) return;
      setDragEnd(getHourFromEvent(e));
    },
    [getHourFromEvent],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging.current || dragStart === null) return;
      isDragging.current = false;
      const end = getHourFromEvent(e);
      const start = Math.min(dragStart, end);
      const finish = Math.max(dragStart, end);
      // If it's a small click (less than 0.2h / ~12min), treat as a seek
      if (finish - start < 0.2) {
        onSeek(start);
      } else {
        onRangeSelect(start, finish);
      }
      setDragStart(null);
      setDragEnd(null);
    },
    [dragStart, getHourFromEvent, onRangeSelect, onSeek],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!selectedRange) return;
      const step = 1;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const newStart = Math.min(selectedRange.start + step, 23);
        const newEnd = Math.min(selectedRange.end + step, 24);
        onRangeSelect(newStart, newEnd);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const newStart = Math.max(selectedRange.start - step, 0);
        const newEnd = Math.max(selectedRange.end - step, 1);
        onRangeSelect(newStart, newEnd);
      } else if (e.key === 'Enter') {
        onSeek(selectedRange.start);
      }
    },
    [selectedRange, onRangeSelect, onSeek],
  );

  // Build hour map for rendering
  const hourMap = new Map<number, boolean>();
  hours.forEach((h) => hourMap.set(h.hour, h.hasData));

  // Drag overlay bounds
  const dragMin =
    dragStart !== null && dragEnd !== null
      ? Math.min(dragStart, dragEnd)
      : null;
  const dragMax =
    dragStart !== null && dragEnd !== null
      ? Math.max(dragStart, dragEnd)
      : null;

  return (
    <div className="rounded-lg border bg-card p-4 flex-1">
      <div
        ref={barRef}
        className="relative h-12 rounded-md bg-muted cursor-pointer select-none"
        role="slider"
        tabIndex={0}
        aria-label="24-hour recording timeline"
        aria-valuemin={0}
        aria-valuemax={24}
        aria-valuenow={selectedRange?.start ?? 0}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          if (isDragging.current) {
            isDragging.current = false;
            setDragStart(null);
            setDragEnd(null);
          }
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Hour segments */}
        {Array.from({ length: 24 }, (_, i) => (
          <div
            key={i}
            className={`absolute top-0 bottom-0 ${hourMap.get(i) ? 'bg-chart-1' : 'bg-transparent'} ${i === 0 ? 'rounded-l-md' : ''} ${i === 23 ? 'rounded-r-md' : ''}`}
            style={{
              left: `${(i / 24) * 100}%`,
              width: `${(1 / 24) * 100}%`,
            }}
            aria-label={`${formatHour(i)} - ${formatHour(i + 1)}: ${hourMap.get(i) ? 'has recording' : 'no recording'}`}
          />
        ))}

        {/* Selection overlay (from selected range) */}
        {selectedRange && !isDragging.current && (
          <div
            className="absolute top-0 bottom-0 bg-primary/20 pointer-events-none"
            style={{
              left: `${(selectedRange.start / 24) * 100}%`,
              width: `${((selectedRange.end - selectedRange.start) / 24) * 100}%`,
            }}
          />
        )}

        {/* Drag overlay */}
        {dragMin !== null && dragMax !== null && (
          <div
            className="absolute top-0 bottom-0 bg-primary/20 pointer-events-none"
            style={{
              left: `${(dragMin / 24) * 100}%`,
              width: `${((dragMax - dragMin) / 24) * 100}%`,
            }}
          />
        )}
      </div>

      {/* Hour labels */}
      <div className="relative mt-1 h-4">
        {HOUR_LABELS.map((h) => (
          <span
            key={h}
            className="absolute text-xs text-muted-foreground -translate-x-1/2"
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {String(h).padStart(2, '0')}
          </span>
        ))}
      </div>

      {/* Selected range text */}
      {selectedRange && (
        <p className="mt-2 text-xs text-muted-foreground">
          {formatHour(selectedRange.start)} - {formatHour(selectedRange.end)} (
          {formatDuration(selectedRange.start, selectedRange.end)})
        </p>
      )}
    </div>
  );
}
