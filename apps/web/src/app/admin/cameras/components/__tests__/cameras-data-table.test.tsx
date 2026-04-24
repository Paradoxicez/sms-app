import { describe, it } from 'vitest';

describe('CamerasDataTable selection plumbing (Phase 20 Plan 03)', () => {
  it.todo('passes getRowId: (row) => row.id to useReactTable (Research Pitfall 1)');
  it.todo('passes enableRowSelection: true to useReactTable');
  it.todo('forwards rowSelection prop into useReactTable state');
  it.todo('forwards onRowSelectionChange prop to useReactTable');
  it.todo('renders the select column as the FIRST column of the table');
  it.todo('header checkbox reads table.getIsAllPageRowsSelected()');
  it.todo('header checkbox indeterminate when some-but-not-all rows selected');
  it.todo('row checkbox click does NOT bubble up (stopPropagation on cell wrapper)');
  it.todo('errorByCameraId prop flows through columns factory into Status cell');
  it.todo('cameras-data-table.tsx still uses useReactTable directly (not shared DataTable primitive) — Planner constraint');
});
