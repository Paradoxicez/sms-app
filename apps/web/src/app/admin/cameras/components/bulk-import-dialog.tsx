'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, Check, X, AlertCircle, Download, Copy } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

import { apiFetch, ApiError } from '@/lib/api';

function extractApiErrorMessage(err: ApiError): string {
  const body = err.body;
  if (typeof body === 'string' && body.trim()) return body;
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    if (typeof obj.message === 'string' && obj.message.trim()) return obj.message;
    const flatten = obj as { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
    const fieldMsgs = flatten.fieldErrors
      ? Object.entries(flatten.fieldErrors).flatMap(([k, v]) => v.map((m) => `${k}: ${m}`))
      : [];
    const formMsgs = flatten.formErrors ?? [];
    const all = [...formMsgs, ...fieldMsgs];
    if (all.length > 0) return `Import failed — ${all.slice(0, 2).join('; ')}`;
  }
  return `Import failed (${err.status} ${err.statusText})`;
}
import { validateStreamUrl } from '@/lib/stream-url-validation';
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

export interface CameraRow {
  name: string;
  streamUrl: string;
  tags: string;
  description: string;
  latitude: string;
  longitude: string;
  errors: Record<string, string>;
  // D-16 (Phase 19): within-file duplicate tracking
  duplicate?: boolean;
  duplicateReason?: 'within-file' | 'against-db';
  // D-12 (Phase 19.1): per-row push/pull discriminator. Optional — absent column
  // in the CSV defaults every row to 'pull' for backward compatibility.
  ingestMode?: 'pull' | 'push';
}

// Phase 19.1 D-14: extra row shape returned by the bulk-import server response
// for the post-import push-URL CSV download.
interface ImportedCamera {
  id?: string;
  name: string;
  ingestMode?: 'pull' | 'push';
  streamUrl: string;
}

interface SiteOption {
  id: string;
  name: string;
  project?: { id: string; name: string };
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_-]/g, '');
}

// Excel-Thai exports default to Windows-874 (CP874/TIS-620), not UTF-8.
// Strict UTF-8 decode of those bytes produces U+FFFD per Thai byte;
// fall back to windows-874 so Thai content round-trips intact.
function decodeFileBytes(buf: ArrayBuffer): string {
  const view = new Uint8Array(buf);
  if (view.length >= 3 && view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(view.subarray(3));
  }
  if (view.length >= 2 && view[0] === 0xff && view[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(view.subarray(2));
  }
  if (view.length >= 2 && view[0] === 0xfe && view[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(view.subarray(2));
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(view);
  } catch {
    return new TextDecoder('windows-874').decode(view);
  }
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
    // Phase 19.1 D-12: ingestMode column — accepts `ingestMode`, `ingest_mode`,
    // `mode` (normalizeHeader strips separators + case).
    ingestModeIdx: findFirst('ingestmode', 'mode'),
  };
}

function rowFromValues(values: string[], map: ReturnType<typeof mapHeaders>): CameraRow {
  // Phase 19.1 D-12: normalize ingestMode case-insensitively.
  // Absent column or unknown values fall back to 'pull' so existing Phase 19
  // CSVs continue to work without modification.
  const rawMode = map.ingestModeIdx >= 0
    ? (values[map.ingestModeIdx] ?? '').trim().toLowerCase()
    : '';
  const ingestMode: 'pull' | 'push' = rawMode === 'push' ? 'push' : 'pull';

  return {
    name: map.nameIdx >= 0 ? values[map.nameIdx]?.trim() || '' : '',
    streamUrl: map.urlIdx >= 0 ? values[map.urlIdx]?.trim() || '' : '',
    tags: map.tagsIdx >= 0 ? values[map.tagsIdx]?.trim() || '' : '',
    description: map.descIdx >= 0 ? values[map.descIdx]?.trim() || '' : '',
    latitude: map.latIdx >= 0 ? values[map.latIdx]?.trim() || '' : '',
    longitude: map.lngIdx >= 0 ? values[map.lngIdx]?.trim() || '' : '',
    errors: {},
    ingestMode,
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
  return arr.map((item: Record<string, unknown>) => {
    const rawMode = String(
      item['ingestMode'] ?? item['ingest_mode'] ?? item['mode'] ?? '',
    ).trim().toLowerCase();
    const ingestMode: 'pull' | 'push' = rawMode === 'push' ? 'push' : 'pull';
    return {
      name: String(item['Camera Name'] || item['camera_name'] || item.name || ''),
      streamUrl: String(item['Stream URL'] || item.streamUrl || item.stream_url || ''),
      tags: String(item.tags || ''),
      description: String(item.description || ''),
      latitude: String(item.latitude || item.lat || ''),
      longitude: String(item.longitude || item.lng || item.lon || ''),
      errors: {},
      ingestMode,
    };
  });
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

export function validateRow(row: CameraRow): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!row.name.trim()) {
    errors.name = 'Name is required';
  }
  const url = row.streamUrl.trim();

  if (row.ingestMode === 'push') {
    // Phase 19.1 D-13: push rows must leave streamUrl empty — server generates.
    // UI-SPEC copy invariant: matches the message in the UI-SPEC Copywriting table verbatim.
    if (url) {
      errors.streamUrl =
        'Push rows must leave streamUrl empty — a URL will be generated.';
    }
  } else if (!url) {
    errors.streamUrl = 'Stream URL is required';
  } else {
    // D-12 + D-16: delegate to shared helper (matches backend zod refine + Add Camera live validation)
    const urlError = validateStreamUrl(url);
    if (urlError) {
      if (urlError === 'URL must start with rtsp://, rtmps://, rtmp://, or srt://') {
        // Row-level brevity vs the form-dialog copy
        errors.streamUrl = 'Must be rtsp://, rtmps://, rtmp://, or srt://';
      } else {
        errors.streamUrl = urlError; // 'Invalid URL — check host and path'
      }
    }
  }
  if (row.latitude && isNaN(Number(row.latitude))) {
    errors.latitude = 'Must be a number';
  }
  if (row.longitude && isNaN(Number(row.longitude))) {
    errors.longitude = 'Must be a number';
  }
  return errors;
}

/**
 * D-16 / D-10a: within-file dedup. Exact string match per D-09 (no normalization).
 * First occurrence is always valid; subsequent rows with the same trimmed streamUrl are flagged.
 *
 * Phase 19.1 D-12: push rows are never flagged as duplicates — server generates
 * the URL after save, so no client-side URL exists to compare. Dedup applies
 * only to pull rows (whose streamUrl is user-supplied).
 */
export function annotateDuplicates(rows: CameraRow[]): CameraRow[] {
  const seen = new Map<string, number>(); // trimmed streamUrl → first row index
  return rows.map((row, idx) => {
    if (row.ingestMode === 'push') {
      return { ...row, duplicate: false, duplicateReason: undefined };
    }
    const url = row.streamUrl.trim();
    if (!url) return { ...row, duplicate: false, duplicateReason: undefined };
    const firstIdx = seen.get(url);
    if (firstIdx !== undefined && firstIdx !== idx) {
      return { ...row, duplicate: true, duplicateReason: 'within-file' as const };
    }
    seen.set(url, idx);
    return { ...row, duplicate: false, duplicateReason: undefined };
  });
}

function downloadSample() {
  // Phase 19.1 D-12: sample includes the ingestMode column with one push row
  // example to document the mixed-batch workflow.
  const csv = `name,streamUrl,ingestMode,description,tags,latitude,longitude
Camera 1,rtsp://192.168.1.10:554/stream1,pull,Front door,outdoor;entrance,13.7563,100.5018
Camera 2,rtsp://192.168.1.11:554/stream1,pull,Back yard,outdoor,13.7564,100.5019
push-cam-1,,push,Encoder feed (URL generated on save),indoor,,`;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cameras-sample.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Phase 19.1 D-14: client-side CSV download of imported push URLs.
 * Renders only when the bulk-import response contains push cameras.
 * Button is one-time — after click, label flips to "Downloaded" for 3s
 * (cosmetic; user can re-enable by closing + reopening the dialog flow).
 */
function PushUrlsDownloadButton({
  cameras,
}: {
  cameras: Array<{ name: string; streamUrl: string }>;
}) {
  const [downloaded, setDownloaded] = useState(false);

  function handleDownload() {
    // CSV escape: double-quote every cell, escape internal quotes by doubling.
    // T-19.1-CSV-INJECT mitigation — safe under CSV RFC 4180.
    const csv =
      'name,streamUrl\n' +
      cameras
        .map(
          (c) =>
            `"${c.name.replace(/"/g, '""')}","${c.streamUrl.replace(/"/g, '""')}"`,
        )
        .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `push-urls-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="outline" onClick={handleDownload} disabled={downloaded}>
            <Download className="mr-2 h-4 w-4" />
            {downloaded ? 'Downloaded' : 'Download push URLs (CSV)'}
          </Button>
        }
      />
      <TooltipContent>
        One-time download — view individual URLs later from each camera.
      </TooltipContent>
    </Tooltip>
  );
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
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');
  // Phase 19.1 D-14: retain the server response post-import so the result panel
  // can render the PushUrlsDownloadButton. Cleared on dialog close.
  const [importedCameras, setImportedCameras] = useState<ImportedCamera[]>([]);
  // Drag-and-drop visual state — true while a file is hovering over the drop zone.
  // Cleared on drop or dragleave so the dashed border returns to its idle color.
  const [isDragOver, setIsDragOver] = useState(false);
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

  /**
   * Shared file-ingest path used by BOTH the file picker (onChange) and the
   * drop zone (onDrop). Branches on extension: .xlsx/.xls go through SheetJS
   * with an ArrayBuffer; .csv/.json read as text and parse line-by-line.
   */
  function handleFile(file: File) {
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
        let text: string;
        try {
          text = decodeFileBytes(reader.result as ArrayBuffer);
        } catch {
          toast.error("Failed to decode file. Save as 'CSV UTF-8 (Comma delimited)' and retry.");
          return;
        }

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
      reader.readAsArrayBuffer(file);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFile(file);
    e.target.value = '';
  }

  /**
   * Drop-zone handlers — wire dragover/dragenter/dragleave/drop on the
   * drop-zone element. `preventDefault()` on dragover is REQUIRED; without it
   * the browser's default "reject the drop" behavior runs and `onDrop` never
   * fires (in the worst case the browser opens the file natively, navigating
   * away from the page). We also call preventDefault on drop itself so the
   * browser doesn't try to render the file. dragenter is needed in addition
   * to dragover because some browsers (Firefox) only fire dragenter on the
   * initial entry, and we want the highlight on the first frame.
   * See `.planning/debug/bulk-import-drop-zone-not-working.md`.
   */
  function handleDragOver(e: React.DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  }

  function handleDragEnter(e: React.DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    handleFile(file);
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

    setRows(annotateDuplicates(validated));
    setStep('preview');
    loadSites();
  }

  function handleCellEdit(index: number, field: keyof CameraRow, value: string) {
    setRows((prev) => {
      const updated = prev.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, [field]: value };
        next.errors = validateRow(next);
        return next;
      });
      return annotateDuplicates(updated);
    });
  }

  function handleRemoveRow(index: number) {
    setRows((prev) => annotateDuplicates(prev.filter((_, i) => i !== index)));
  }

  const validCount = rows.filter((r) => Object.keys(r.errors).length === 0 && !r.duplicate).length;
  const duplicateCount = rows.filter((r) => Object.keys(r.errors).length === 0 && r.duplicate).length;
  const errorCount = rows.filter((r) => Object.keys(r.errors).length > 0).length;
  const canImport = (validCount + duplicateCount) > 0 && errorCount === 0 && !!selectedSiteId;

  async function handleImport() {
    if (!canImport) return;

    setImporting(true);
    setProgress(0);

    try {
      // Client-side skip duplicates to reduce payload; server (P04 Task 5) also dedupes authoritatively
      const payloadRows = rows.filter(
        (r) => Object.keys(r.errors).length === 0 && !r.duplicate,
      );
      const cameras = payloadRows.map((r) => {
        const tagsArr = r.tags
          ? r.tags.split(/[,;]/).map((t) => t.trim()).filter(Boolean)
          : [];
        return {
          name: r.name,
          // Phase 19.1 D-12: pull rows send streamUrl; push rows omit it so the
          // server generates the key + URL.
          ...(r.ingestMode === 'push' ? {} : { streamUrl: r.streamUrl }),
          ingestMode: r.ingestMode ?? 'pull',
          tags: tagsArr.length > 0 ? tagsArr : undefined,
          description: r.description || undefined,
          ...(r.latitude && r.longitude
            ? { location: { lat: Number(r.latitude), lng: Number(r.longitude) } }
            : {}),
        };
      });

      setProgress(50);

      const result = await apiFetch<{
        imported: number;
        skipped?: number;
        errors: Array<{ row: number; message: string }>;
        cameras?: ImportedCamera[];
      }>('/api/cameras/bulk-import', {
        method: 'POST',
        body: JSON.stringify({ cameras, siteId: selectedSiteId }),
      });

      setProgress(100);

      const imported = result?.imported ?? 0;
      const skipped = result?.skipped ?? 0;
      const importedList = result?.cameras ?? [];

      // Phase 19.1 D-14: split response by mode for the toast copy + download button.
      const pushImported = importedList.filter((c) => c.ingestMode === 'push');
      const pullImported = importedList.filter((c) => c.ingestMode !== 'push');
      const pushCount = pushImported.length;
      const pullCount = pullImported.length;

      if (imported > 0 && pushCount > 0 && pullCount === 0) {
        toast.success(
          `Imported ${pushCount} push cameras. Download URLs to configure your encoders.`,
        );
      } else if (imported > 0 && pushCount > 0 && pullCount > 0) {
        toast.success(
          `Imported ${imported} cameras (${pushCount} push, ${pullCount} pull). ${skipped} skipped as duplicates.`,
        );
      } else if (imported > 0 && skipped === 0) {
        toast.success(`Imported ${imported} cameras successfully.`);
      } else if (imported > 0 && skipped > 0) {
        toast.success(`Imported ${imported} cameras, skipped ${skipped} duplicates.`);
      } else if (imported === 0 && skipped > 0) {
        toast.warning(`No cameras imported — all ${skipped} rows were duplicates.`);
      } else {
        toast.error('Import failed. Check camera limits and try again.');
      }

      // Notify parent (refresh table) without closing the dialog so the result
      // panel + download button stay visible until the user explicitly dismisses.
      onSuccess();

      if (pushCount > 0) {
        // Phase 19.1 D-14: stay on result step so the user can click
        // Download push URLs (CSV) before closing.
        setImportedCameras(importedList);
        setStep('result');
      } else {
        // Pull-only flow: existing UX — close immediately after import.
        onOpenChange(false);
        setRows([]);
        setStep('upload');
        setProgress(null);
        setImportedCameras([]);
      }
    } catch (err) {
      const message =
        err instanceof ApiError
          ? extractApiErrorMessage(err)
          : 'Import failed. Try again.';
      toast.error(message);
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
      // Phase 19.1 D-14: discard imported-camera snapshot when the dialog closes
      // so the next open session starts fresh.
      setImportedCameras([]);
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
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              data-drag-over={isDragOver ? 'true' : undefined}
              className={`flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-12 text-center transition-colors hover:border-primary/50 hover:bg-muted/50 ${
                isDragOver
                  ? 'border-primary bg-muted/50'
                  : 'border-muted-foreground/25'
              }`}
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
                  Columns: name, streamUrl, ingestMode, description, tags, latitude, longitude
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
                                  <X className="mx-auto h-4 w-4 text-destructive" aria-hidden="true" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  {Object.values(row.errors).join(', ')}
                                </TooltipContent>
                              </Tooltip>
                            ) : row.duplicate ? (
                              <Tooltip>
                                <TooltipTrigger>
                                  <Copy
                                    className="mx-auto h-4 w-4 text-amber-600 dark:text-amber-500"
                                    aria-hidden="true"
                                  />
                                </TooltipTrigger>
                                <TooltipContent>
                                  {row.duplicateReason === 'against-db'
                                    ? 'Already imported in this organization'
                                    : 'Duplicate of existing camera'}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <Check className="mx-auto h-4 w-4 text-primary" aria-hidden="true" />
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
              <span className="text-primary font-medium inline-flex items-center gap-1">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                {validCount} valid
              </span>
              {duplicateCount > 0 && (
                <span className="text-amber-600 dark:text-amber-500 font-medium inline-flex items-center gap-1">
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  {duplicateCount} duplicate
                </span>
              )}
              {errorCount > 0 && (
                <span className="flex items-center gap-1 text-destructive font-medium">
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
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

        {step === 'result' && (
          <>
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                  <span className="font-medium">
                    Imported {importedCameras.length} cameras
                    {(() => {
                      const p = importedCameras.filter((c) => c.ingestMode === 'push').length;
                      const q = importedCameras.length - p;
                      if (p > 0 && q > 0) return ` (${p} push, ${q} pull)`;
                      if (p > 0) return ` (${p} push)`;
                      return '';
                    })()}
                    .
                  </span>
                </div>

                {importedCameras.some((c) => c.ingestMode === 'push') && (
                  <div className="mt-3">
                    <TooltipProvider>
                      <PushUrlsDownloadButton
                        cameras={importedCameras
                          .filter((c) => c.ingestMode === 'push')
                          .map((c) => ({ name: c.name, streamUrl: c.streamUrl }))}
                      />
                    </TooltipProvider>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                onClick={() => handleClose(false)}
              >
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
