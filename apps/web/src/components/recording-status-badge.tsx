import { Badge } from '@/components/ui/badge';

export type RecordingStatus = 'recording' | 'complete' | 'processing' | 'error';

export function RecordingStatusBadge({ status }: { status: RecordingStatus }) {
  switch (status) {
    case 'complete':
      return (
        <Badge className="bg-chart-1 text-white hover:bg-chart-1/90">
          Complete
        </Badge>
      );
    case 'recording':
      return (
        <Badge className="bg-chart-5 text-white animate-pulse hover:bg-chart-5/90">
          Recording
        </Badge>
      );
    case 'processing':
      return (
        <Badge className="bg-chart-4 text-white hover:bg-chart-4/90">
          Processing
        </Badge>
      );
    default:
      return <Badge variant="destructive">Error</Badge>;
  }
}
