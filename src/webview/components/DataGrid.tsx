/**
 * DataGrid Component
 * Main data table component using TanStack Table with virtualization
 */

import React, { useMemo, useCallback, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
  ColumnResizeMode,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { IDataFrame, IColumnDef, CellValue } from '../../../core/types';
import { useDataStore } from '../store/dataStore';

/**
 * Props for DataGrid component
 */
interface IDataGridProps {
  data: IDataFrame;
  onCopy: (text: string) => void;
}

/**
 * Format cell value for display
 */
function formatCellValue(value: CellValue, columnType: string): string {
  if (value === null || value === undefined) {
    return 'NA';
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  if (columnType === 'numeric' && typeof value === 'number') {
    // Format numbers with reasonable precision
    if (Number.isInteger(value)) {
      return value.toString();
    }
    return value.toFixed(4).replace(/\.?0+$/, '');
  }

  return String(value);
}

/**
 * Get CSS class for cell based on value type
 */
function getCellClass(value: CellValue, columnType: string): string {
  if (value === null || value === undefined) {
    return 'cell-na';
  }

  switch (columnType) {
    case 'numeric':
    case 'integer':
      return 'cell-numeric';
    case 'logical':
      return 'cell-logical';
    case 'Date':
    case 'POSIXct':
    case 'POSIXlt':
      return 'cell-date';
    case 'factor':
      return 'cell-factor';
    default:
      return 'cell-character';
  }
}

/**
 * DataGrid component
 */
/**
 * Highlight matching text in a string
 */
function highlightText(text: string, search: string): React.ReactNode {
  if (!search || search.length < 1) {
    return text;
  }
  
  const parts = text.split(new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  
  return parts.map((part, i) => 
    part.toLowerCase() === search.toLowerCase() 
      ? <mark key={i} className="search-highlight">{part}</mark>
      : part
  );
}

export const DataGrid: React.FC<IDataGridProps> = ({ data, onCopy }) => {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const { sort, setSort, columnWidths, setColumnWidth, hiddenColumns, filter } = useDataStore();
  const searchTerm = filter.globalSearch || '';

  // Convert sort state
  const [sorting, setSorting] = React.useState<SortingState>(() =>
    sort.map((s) => ({ id: s.columnName, desc: s.direction === 'desc' }))
  );

  // Filter visible columns
  const visibleColumns = useMemo(() => {
    return data.columns.filter((col) => !hiddenColumns.has(col.name));
  }, [data.columns, hiddenColumns]);

  // Create column definitions
  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<CellValue[]>();

    return visibleColumns.map((col) => {
      const originalIndex = data.columns.findIndex((c) => c.name === col.name);
      return columnHelper.accessor((row) => row[originalIndex], {
        id: col.name,
        header: () => (
          <div className="column-header">
            <span className="column-name">{col.name}</span>
            {col.label && <span className="column-label">{col.label}</span>}
            <span className={`column-type type-${col.type}`}>{col.type}</span>
          </div>
        ),
        cell: (info) => {
          const value = info.getValue();
          const formattedValue = formatCellValue(value, col.type);
          const shouldHighlight = searchTerm && value !== null && value !== undefined;
          
          return (
            <span className={getCellClass(value, col.type)}>
              {shouldHighlight ? highlightText(formattedValue, searchTerm) : formattedValue}
            </span>
          );
        },
        size: columnWidths[col.name] ?? 150,
        minSize: 50,
        maxSize: 500,
      });
    });
  }, [visibleColumns, data.columns, columnWidths, searchTerm]);

  // Convert row data
  const rowData = useMemo(() => {
    return data.rows.map((row) => {
      // Handle both array and object row formats
      if (Array.isArray(row)) {
        return row;
      }
      // Convert object to array based on column order
      return data.columns.map((col) => (row as Record<string, CellValue>)[col.name]);
    });
  }, [data.rows, data.columns]);

  // Create table instance
  const table = useReactTable({
    data: rowData,
    columns,
    state: {
      sorting,
    },
    onSortingChange: (updater) => {
      const newSorting = typeof updater === 'function' ? updater(sorting) : updater;
      setSorting(newSorting);
      setSort(
        newSorting.map((s) => ({
          columnName: s.id,
          direction: s.desc ? 'desc' : 'asc',
        }))
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    columnResizeMode: 'onChange' as ColumnResizeMode,
    enableColumnResizing: true,
  });

  // Virtual row handling for large datasets
  const { rows } = table.getRowModel();

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 32, // Row height
    overscan: 20,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  // Handle cell copy
  const handleCellClick = useCallback(
    (event: React.MouseEvent, value: CellValue) => {
      if (event.detail === 2) {
        // Double click to copy
        onCopy(formatCellValue(value, 'character'));
      }
    },
    [onCopy]
  );

  // Handle column resize
  const handleColumnResize = useCallback(
    (columnId: string, width: number) => {
      setColumnWidth(columnId, width);
    },
    [setColumnWidth]
  );

  return (
    <div className="data-grid-container" ref={tableContainerRef}>
      <table className="data-grid">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {/* Row number header */}
              <th className="row-number-header">#</th>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  style={{ width: header.getSize() }}
                  className={header.column.getIsSorted() ? 'sorted' : ''}
                >
                  <div
                    className="header-content"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() && (
                      <span className="sort-indicator">
                        {header.column.getIsSorted() === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                  {/* Column resize handle */}
                  <div
                    className={`resize-handle ${
                      header.column.getIsResizing() ? 'resizing' : ''
                    }`}
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                  />
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody
          style={{
            height: `${totalSize}px`,
            position: 'relative',
          }}
        >
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <tr
                key={row.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className={virtualRow.index % 2 === 0 ? 'even' : 'odd'}
              >
                {/* Row number */}
                <td className="row-number">{virtualRow.index + 1}</td>
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    style={{ width: cell.column.getSize() }}
                    onClick={(e) => handleCellClick(e, cell.getValue() as CellValue)}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default DataGrid;

