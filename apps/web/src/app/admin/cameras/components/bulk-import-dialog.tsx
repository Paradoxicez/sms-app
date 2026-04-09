'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, Check, X, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface CameraRow {
  name: string;
  streamUrl: string;
  tags: string;
  description: string;
  errors: Record<string, string>;
}

interface SiteOption {
  id: string;
  name: string;
  project?: { id: string; name: string };
}

function parseCSV(text: string): CameraRow[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headerLine = lines[0].toLowerCase();
  const headers = headerLine.split(',').map((h) => h.trim());

  const nameIdx = headers.indexOf('name');
  const urlIdx = headers.indexOf('streamurl') !== -1 ? headers.indexOf('streamurl') : headers.indexOf('stream_url');
  const tagsIdx = headers.indexOf('tags');
  const descIdx = headers.indexOf('description');

  return lines.slice(1).filter(Boolean).map((line) => {
    const values = line.split(',').map((v) => v.trim());
    return {
      name: nameIdx >= 0 ? values[nameIdx] || '' : '',
      streamUrl: urlIdx >= 0 ? values[urlIdx] || '' : '',
      tags: tagsIdx >= 0 ? values[tagsIdx] || '' : '',
      description: descIdx >= 0 ? values[descIdx] || '' : '',
      errors: {},
    };
  });
}

function parseJSON(text: string): CameraRow[] {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : [];
  return arr.map((item: Record<string, unknown>) => ({
    name: String(item.name || ''),
    streamUrl: String(item.streamUrl || item.stream_url || ''),
    tags: String(item.tags || ''),
    description: String(item.description || ''),
    errors: {},
  }));
}

function validateRow(row: CameraRow): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!row.name.trim()) {
    errors.name = 'Name is required';
  }
  if (!row.streamUrl.trim()) {
    errors.streamUrl = 'Stream URL is required';
  } else if (
    !row.streamUrl.startsWith('rtsp://') &&
    !row.streamUrl.startsWith('srt://')
  ) {
    errors.streamUrl = 'Must be rtsp:// or srt://';
  }
  return errors;
}

export function BulkImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: BulkImportDialogProps) {
  const [rows, setRows] = useState<CameraRow[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSites = useCallback(async () => {
    try {
      const projects = await apiFetch<Array<{ id: string; name: string }>>('/api/projects');
      const allSites: SiteOption[] = [];
      for (const proj of projects) {
        const projectSites = await apiFetch<Array<{ id: string; name: string }>>(
          `/api/projects/${proj.id}/sites`,
        );
        for (const s of projectSites) {
          allSites.push({ id: s.id, name: s.name, project: proj });
        }
      }
      setSites(allSites);
      if (allSites.length > 0 && !selectedSiteId) {
        setSelectedSiteId(allSites[0].id);
      }
    } catch {
      // Sites may not be available
    }
  }, [selectedSiteId]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Max file size check (T-02-17)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Maximum 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      let parsed: CameraRow[] = [];

      try {
        if (file.name.endsWith('.json')) {
          parsed = parseJSON(text);
        } else if (file.name.endsWith('.csv')) {
          parsed = parseCSV(text);
        } else {
          toast.error('Only CSV and JSON files are supported.');
          return;
        }
      } catch {
        toast.error('Failed to parse file. Check the format.');
        return;
      }

      if (parsed.length === 0) {
        toast.error('No cameras found in file.');
        return;
      }

      if (parsed.length > 500) {
        toast.error('Maximum 500 cameras per import.');
        parsed = parsed.slice(0, 500);
      }

      // Validate each row
      const validated = parsed.map((row) => ({
        ...row,
        errors: validateRow(row),
      }));

      setRows(validated);
      setStep('preview');
      loadSites();
    };
    reader.readAsText(file);

    // Reset input
    e.target.value = '';
  }

  function handleCellEdit(index: number, field: keyof CameraRow, value: string) {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const updated = { ...row, [field]: value };
        updated.errors = validateRow(updated);
        return updated;
      }),
    );
  }

  function handleRemoveRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  const validCount = rows.filter((r) => Object.keys(r.errors).length === 0).length;
  const errorCount = rows.filter((r) => Object.keys(r.errors).length > 0).length;
  const canImport = validCount > 0 && errorCount === 0 && !!selectedSiteId;

  async function handleImport() {
    if (!canImport) return;

    setImporting(true);
    setProgress(0);

    try {
      const cameras = rows.map((r) => ({
        name: r.name,
        streamUrl: r.streamUrl,
        tags: r.tags || undefined,
        description: r.description || undefined,
      }));

      setProgress(50);

      const result = await apiFetch<{ imported: number; errors: Array<{ row: number; message: string }> }>(
        '/api/cameras/bulk-import',
        {
          method: 'POST',
          body: JSON.stringify({ cameras, siteId: selectedSiteId }),
        },
      );

      setProgress(100);
      toast.success(`Imported ${result.imported} cameras successfully`);
      onOpenChange(false);
      onSuccess();

      // Reset state
      setRows([]);
      setStep('upload');
      setProgress(null);
    } catch (err) {
      toast.error('Import failed. Check camera limits and try again.');
    } finally {
      setImporting(false);
    }
  }

  function handleClose(isOpen: boolean) {
    if (!isOpen) {
      setRows([]);
      setStep('upload');
      setProgress(null);
      setImporting(false);
    }
    onOpenChange(isOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={step === 'preview' ? 'sm:max-w-3xl' : 'sm:max-w-md'}>
        <DialogHeader>
          <DialogTitle>Import Cameras</DialogTitle>
          <DialogDescription>
            Upload a CSV or JSON file to add multiple cameras at once.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/25 p-12 text-center transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  Drop CSV or JSON file here, or click to upload
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Columns: name, streamUrl, tags, description
                </p>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            {/* Site selector */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium whitespace-nowrap">Import to Site:</span>
              <Select
                value={selectedSiteId}
                onValueChange={(v) => setSelectedSiteId(String(v ?? ''))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a site" />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.project?.name ? `${s.project.name} / ` : ''}
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Preview table */}
            <div className="max-h-80 overflow-auto rounded-md border">
              <TooltipProvider>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Stream URL</TableHead>
                      <TableHead>Tags</TableHead>
                      <TableHead className="w-16">Status</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, idx) => {
                      const hasErrors = Object.keys(row.errors).length > 0;
                      return (
                        <TableRow
                          key={idx}
                          className={hasErrors ? 'bg-destructive/10' : ''}
                        >
                          <TableCell className="text-xs text-muted-foreground">
                            {idx + 1}
                          </TableCell>
                          <TableCell>
                            <Input
                              value={row.name}
                              onChange={(e) =>
                                handleCellEdit(idx, 'name', e.target.value)
                              }
                              className={`h-7 text-xs ${
                                row.errors.name
                                  ? 'border-destructive focus-visible:ring-destructive/50'
                                  : ''
                              }`}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={row.streamUrl}
                              onChange={(e) =>
                                handleCellEdit(idx, 'streamUrl', e.target.value)
                              }
                              className={`h-7 font-mono text-xs ${
                                row.errors.streamUrl
                                  ? 'border-destructive focus-visible:ring-destructive/50'
                                  : ''
                              }`}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={row.tags}
                              onChange={(e) =>
                                handleCellEdit(idx, 'tags', e.target.value)
                              }
                              className="h-7 text-xs"
                              placeholder="tag1, tag2"
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            {hasErrors ? (
                              <Tooltip>
                                <TooltipTrigger>
                                  <X className="mx-auto h-4 w-4 text-destructive" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  {Object.values(row.errors).join(', ')}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <Check className="mx-auto h-4 w-4 text-primary" />
                            )}
                          </TableCell>
                          <TableCell>
                            <button
                              onClick={() => handleRemoveRow(idx)}
                              className="rounded p-1 hover:bg-muted"
                              title="Remove row"
                            >
                              <X className="h-3 w-3 text-muted-foreground" />
                            </button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TooltipProvider>
            </div>

            {/* Summary */}
            <div className="flex items-center gap-4 text-sm">
              <span className="text-primary font-medium">
                {validCount} valid
              </span>
              {errorCount > 0 && (
                <span className="flex items-center gap-1 text-destructive font-medium">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {errorCount} errors
                </span>
              )}
            </div>

            {/* Progress */}
            {progress !== null && (
              <Progress value={progress} className="h-2" />
            )}
          </div>
        )}

        {step === 'preview' && (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setStep('upload');
                setRows([]);
              }}
              disabled={importing}
            >
              Back
            </Button>
            <Button
              onClick={handleImport}
              disabled={!canImport || importing}
            >
              {importing ? 'Importing...' : 'Confirm Import'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
