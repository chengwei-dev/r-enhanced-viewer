/**
 * StatusBar Component
 * Bottom status bar showing row counts and selection info
 */

import React from 'react';

/**
 * Props for StatusBar component
 */
interface IStatusBarProps {
  rowCount: number;
  columnCount: number;
  selectedCount: number;
  filteredCount?: number;
}

/**
 * Format number with commas
 */
function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * StatusBar component
 */
export const StatusBar: React.FC<IStatusBarProps> = ({
  rowCount,
  columnCount,
  selectedCount,
  filteredCount,
}) => {
  const isFiltered = filteredCount !== undefined && filteredCount !== rowCount;

  return (
    <div className="status-bar">
      <div className="status-left">
        <span className="status-item">
          <span className="status-label">Rows:</span>
          <span className="status-value">
            {isFiltered ? (
              <>
                {formatNumber(filteredCount)} / {formatNumber(rowCount)}
              </>
            ) : (
              formatNumber(rowCount)
            )}
          </span>
        </span>
        <span className="status-divider">|</span>
        <span className="status-item">
          <span className="status-label">Columns:</span>
          <span className="status-value">{formatNumber(columnCount)}</span>
        </span>
      </div>

      <div className="status-center">
        {isFiltered && (
          <span className="status-filter-active">
            🔍 Filter Active
          </span>
        )}
      </div>

      <div className="status-right">
        {selectedCount > 0 && (
          <span className="status-item">
            <span className="status-label">Selected:</span>
            <span className="status-value">{formatNumber(selectedCount)} cells</span>
          </span>
        )}
      </div>
    </div>
  );
};

export default StatusBar;

