'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, Check, X, AlertCircle, Download } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

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
  latitude: string;
  longitude: string;
  errors: Record<string, string>;
}

interface SiteOption {
  id: string;
  name: string;
  project?: { id: string; name: string };
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_-]/g, '');
}

function mapHeaders(headers: string[]) {
  const normalized = headers.map(normalizeHeader);

  // Use lastIndexOf for lat/lng to handle duplicate columns (site vs camera)
  function findFirst(...names: string[]) {
    for (const n of names) {
      const idx = normalized.indexOf(n);
      if (idx >= 0) return idx;
    }
    return -1;
  }
  function findLast(...names: string[]) {
    for (const n of names) {
      const idx = normalized.lastIndexOf(n);
      if (idx >= 0) return idx;
    }
    return -1;
  }

  return {
    nameIdx: findFirst('cameraname', 'name'),
    urlIdx: findFirst('streamurl', 'url'),
    tagsIdx: findFirst('tags'),
    descIdx: findFirst('description'),
    latIdx: findLast('latitude', 'lat'),
    lngIdx: findLast('longitude', 'lng', 'lon'),
  };
}

function rowFromValues(values: string[], map: ReturnType<typeof mapHeaders>): CameraRow {
  return {
    name: map.nameIdx >= 0 ? values[map.nameIdx]?.trim() || '' : '',
    streamUrl: map.urlIdx >= 0 ? values[map.urlIdx]?.trim() || '' : '',
    tags: map.tagsIdx >= 0 ? values[map.tagsIdx]?.trim() || '' : '',
    description: map.descIdx >= 0 ? values[map.descIdx]?.trim() || '' : '',
    latitude: map.latIdx >= 0 ? values[map.latIdx]?.trim() || '' : '',
    longitude: map.lngIdx >= 0 ? values[map.lngIdx]?.trim() || '' : '',
    errors: {},
  };
}

function parseCSV(text: string): CameraRow[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  const map = mapHeaders(headers);

  return lines.slice(1).filter(Boolean).map((line) => {
    const values = line.split(',').map((v) => v.trim());
    return rowFromValues(values, map);
  });
}

function parseJSON(text: string): CameraRow[] {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : [];
  return arr.map((item: Record<string, unknown>) => ({
    name: String(item['Camera Name'] || item['camera_name'] || item.name || ''),
    streamUrl: String(item['Stream URL'] || item.streamUrl || item.stream_url || ''),
    tags: String(item.tags || ''),
    description: String(item.description || ''),
    latitude: String(item.latitude || item.lat || ''),
    longitude: String(item.longitude || item.lng || item.lon || ''),
    errors: {},
  }));
}

function parseExcel(data: ArrayBuffer): CameraRow[] {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  // Use header:'A' to get raw arrays, then apply mapHeaders for consistent parsing
  const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
  if (rawRows.length < 2) return [];

  const headers = rawRows[0].map(String);
  const map = mapHeaders(headers);

  return rawRows.slice(1).filter((row) => row.some((v) => String(v).trim())).map((row) => {
    const values = row.map(String);
    return rowFromValues(values, map);
  });
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
  if (row.latitude && isNaN(Number(row.latitude))) {
    errors.latitude = 'Must be a number';
  }
  if (row.longitude && isNaN(Number(row.longitude))) {
    errors.longitude = 'Must be a number';
  }
  return errors;
}

function downloadSample() {
  const csv = `name,streamUrl,description,tags,latitude,longitude
Camera 1,rtsp://192.168.1.10:554/stream1,Front door,outdoor;entrance,13.7563,100.5018
Camera 2,rtsp://192.168.1.11:554/stream1,Back yard,outdoor,13.7564,100.5019
Camera 3,rtsp://192.168.1.12:554/stream1,Lobby,indoor,,`;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cameras-sample.csv';
  a.click();
  URL.revokeObjectURL(url);
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

    // Max file size check
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Maximum 5MB.');
      return;
    }

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = parseExcel(reader.result as ArrayBuffer);
          processRows(parsed);
        } catch {
          toast.error('Failed to parse Excel file.');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
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
            toast.error('Supported formats: CSV, JSON, Excel (.xlsx)');
            return;
          }
        } catch {
          toast.error('Failed to parse file. Check the format.');
          return;
        }

        processRows(parsed);
      };
      reader.readAsText(file);
    }

    e.target.value = '';
  }

  function processRows(parsed: CameraRow[]) {
    if (parsed.length === 0) {
      toast.error('No cameras found in file.');
      return;
    }

    if (parsed.length > 500) {
      toast.error('Maximum 500 cameras per import.');
      parsed = parsed.slice(0, 500);
    }

    const validated = parsed.map((row) => ({
      ...row,
      errors: validateRow(row),
    }));

    setRows(validated);
    setStep('preview');
    loadSites();
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
        ...(r.latitude && r.longitude
          ? { location: { lat: Number(r.latitude), lng: Number(r.longitude) } }
          : {}),
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

      setRows([]);
      setStep('upload');
      setProgress(null);
    } catch {
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
      <DialogContent className={step === 'preview' ? 'sm:max-w-4xl' : 'sm:max-w-md'}>
        <DialogHeader>
          <DialogTitle>Import Cameras</DialogTitle>
          <DialogDescription>
            Upload a CSV, JSON, or Excel file to add multiple cameras at once.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/25 p-12 text-center transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  Drop file here, or click to upload
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  CSV, JSON, or Excel (.xlsx) — max 500 cameras
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Columns: name, streamUrl, description, tags, latitude, longitude
                </p>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json,.xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={downloadSample}
            >
              <Download className="mr-2 h-4 w-4" />
              Download Sample CSV
            </Button>
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
                  <SelectValue placeholder="Select a site">
                    {(() => {
                      const site = sites.find((s) => s.id === selectedSiteId);
                      if (!site) return 'Select a site';
                      return site.project?.name ? `${site.project.name} / ${site.name}` : site.name;
                    })()}
                  </SelectValue>
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
                      <TableHead>Lat</TableHead>
                      <TableHead>Lng</TableHead>
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
                          <TableCell>
                            <Input
                              value={row.latitude}
                              onChange={(e) =>
                                handleCellEdit(idx, 'latitude', e.target.value)
                              }
                              className={`h-7 text-xs w-20 ${
                                row.errors.latitude
                                  ? 'border-destructive focus-visible:ring-destructive/50'
                                  : ''
                              }`}
                              placeholder="13.75"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={row.longitude}
                              onChange={(e) =>
                                handleCellEdit(idx, 'longitude', e.target.value)
                              }
                              className={`h-7 text-xs w-20 ${
                                row.errors.longitude
                                  ? 'border-destructive focus-visible:ring-destructive/50'
                                  : ''
                              }`}
                              placeholder="100.50"
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
