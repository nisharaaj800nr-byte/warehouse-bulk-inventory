/* Data table + pagination primitives. */
import { type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cx } from '../lib/utils';
import { EmptyState, Skeleton } from './base';

export interface Column<T> {
  key: string;
  label: ReactNode;
  width?: number | string;
  align?: 'left' | 'right';
  render?: (row: T, index: number) => ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading,
  empty,
  skeletonRows = 6,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: ReactNode;
  skeletonRows?: number;
}) {
  if (loading && rows.length === 0) {
    return (
      <div className="stack" style={{ gap: 8, padding: 12 }}>
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <Skeleton key={i} h={32} />
        ))}
      </div>
    );
  }
  if (!loading && rows.length === 0) {
    return <>{empty ?? <EmptyState title="No data" />}</>;
  }
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={c.width ? { width: c.width } : undefined} className={cx(c.align === 'right' && 'num')}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              className={cx(onRowClick && 'clickable')}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={cx(c.align === 'right' && 'num')}>
                  {c.render ? c.render(row, i) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {loading && (
        <div style={{ padding: 8 }}>
          <Skeleton h={4} />
        </div>
      )}
    </div>
  );
}

export function Pagination({
  page,
  perPage,
  total,
  onPage,
  onPerPage,
  perPageOptions = [25, 50, 100],
}: {
  page: number;
  perPage: number;
  total: number;
  onPage: (p: number) => void;
  onPerPage: (n: number) => void;
  perPageOptions?: number[];
}) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, perPage)));
  const start = total === 0 ? 0 : (page - 1) * perPage + 1;
  const end = Math.min(total, page * perPage);
  return (
    <div className="pagination">
      <div className="page-info row" style={{ gap: 8 }}>
        <span className="tnum">
          {start}–{end} of {total}
        </span>
        <span className="row" style={{ gap: 6 }}>
          Rows:
          <select
            className="select"
            style={{ width: 72, padding: '2px 22px 2px 8px', height: 28, fontSize: 12.5 }}
            value={perPage}
            onChange={(e) => onPerPage(Number(e.target.value))}
            aria-label="Rows per page"
          >
            {perPageOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </span>
      </div>
      <div className="pager">
        <button onClick={() => onPage(1)} disabled={page <= 1} aria-label="First page">
          <ChevronsLeft size={14} />
        </button>
        <button onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft size={14} />
        </button>
        <span className="page-info tnum" style={{ padding: '0 8px' }}>
          Page {page} / {pages}
        </span>
        <button onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page">
          <ChevronRight size={14} />
        </button>
        <button onClick={() => onPage(pages)} disabled={page >= pages} aria-label="Last page">
          <ChevronsRight size={14} />
        </button>
      </div>
    </div>
  );
}
