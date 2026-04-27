'use client';

import { ArrowLeft, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { addDays, format, startOfDay, subDays } from 'date-fns';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { TagsCell } from '@/app/admin/cameras/components/tags-cell';

export interface PlaybackPageHeaderProps {
  cameraName: string;
  siteName?: string;
  projectName?: string;
  tags?: string[];                // Phase 23 DEBT-04
  description?: string | null;    // Phase 23 DEBT-04
  selectedDate: Date;
  displayedMonth: Date;
  daysWithRecordings: number[];
  onDateChange: (d: Date) => void;
  onMonthChange: (d: Date) => void;
  onBack: () => void;
}

export function PlaybackPageHeader({
  cameraName,
  siteName,
  projectName,
  tags,
  description,
  selectedDate,
  displayedMonth,
  daysWithRecordings,
  onDateChange,
  onMonthChange,
  onBack,
}: PlaybackPageHeaderProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  // Phase 23 DEBT-04 — Show more disclosure for description; mirrors the
  // 120-char heuristic from the Phase 22 camera-popup pattern.
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const descriptionIsLong = (description?.length ?? 0) > 120;
  const today = startOfDay(new Date());
  const isAtToday = startOfDay(selectedDate).getTime() >= today.getTime();

  const hasRecordingDates = daysWithRecordings.map(
    (d) =>
      new Date(
        displayedMonth.getFullYear(),
        displayedMonth.getMonth(),
        d,
      ),
  );

  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        aria-label="Back to Recordings"
      >
        <ArrowLeft className="mr-2 size-4" />
        Back to Recordings
      </Button>

      {/* Phase 23 DEBT-04 — Camera metadata block (D-18). Hidden when both
          tags and description are absent so cameras without either skip the
          empty bordered area entirely. */}
      {((tags && tags.length > 0) || description) && (
        <div className="space-y-2 pb-3 border-b">
          {tags && tags.length > 0 && (
            <TagsCell tags={tags} maxVisible={4} />
          )}
          {description && (
            <div className="text-sm text-muted-foreground">
              <p className={descriptionExpanded ? '' : 'line-clamp-2'}>
                {description}
              </p>
              {descriptionIsLong && (
                <button
                  type="button"
                  onClick={() => setDescriptionExpanded((v) => !v)}
                  className="text-xs text-primary hover:underline mt-1"
                >
                  {descriptionExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-semibold md:text-2xl">{cameraName}</h1>
          {(siteName || projectName) && (
            <p className="text-sm text-muted-foreground">
              {[siteName, projectName].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous day"
            onClick={() => onDateChange(subDays(selectedDate, 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>

          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Select date"
                  className="font-semibold"
                >
                  {format(selectedDate, 'MMM d, yyyy')}
                  <ChevronDown className="ml-2 size-4" />
                </Button>
              }
            />
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                month={displayedMonth}
                onMonthChange={onMonthChange}
                onSelect={(d) => {
                  if (d) {
                    onDateChange(d);
                    setPopoverOpen(false);
                  }
                }}
                modifiers={{ hasRecording: hasRecordingDates }}
                modifiersClassNames={{
                  hasRecording:
                    'relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-chart-1',
                }}
              />
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Next day"
            disabled={isAtToday}
            onClick={() => onDateChange(addDays(selectedDate, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
