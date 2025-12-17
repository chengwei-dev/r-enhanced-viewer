/**
 * Toolbar Component
 * Top toolbar with actions, search, and column manager
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDataStore } from '../store/dataStore';

/**
 * Props for Toolbar component
 */
interface IToolbarProps {
  dataFrameName: string;
  onRefresh: () => void;
}

/**
 * Toolbar component
 */
export const Toolbar: React.FC<IToolbarProps> = ({ dataFrameName, onRefresh }) => {
  const [searchValue, setSearchValue] = useState('');
  const [showColumnManager, setShowColumnManager] = useState(false);
  const columnManagerRef = useRef<HTMLDivElement>(null);
  const { data, filter, setFilter, resetView, hiddenColumns, toggleColumnVisibility } = useDataStore();

  // Close column manager when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnManagerRef.current && !columnManagerRef.current.contains(event.target as Node)) {
        setShowColumnManager(false);
      }
    };

    if (showColumnManager) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showColumnManager]);

  // Handle search input
  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setSearchValue(value);

      // Update filter with global search
      setFilter({
        ...filter,
        enabled: value.length > 0,
        globalSearch: value,
      });
    },
    [filter, setFilter]
  );

  // Clear search
  const handleClearSearch = useCallback(() => {
    setSearchValue('');
    setFilter({
      ...filter,
      enabled: filter.groups.length > 0,
      globalSearch: '',
    });
  }, [filter, setFilter]);

  // Handle reset
  const handleReset = useCallback(() => {
    setSearchValue('');
    resetView();
  }, [resetView]);

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <span className="data-frame-name" title={dataFrameName}>
          📊 {dataFrameName}
        </span>
      </div>

      <div className="toolbar-center">
        <div className="search-container">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search all columns..."
            value={searchValue}
            onChange={handleSearchChange}
          />
          {searchValue && (
            <button
              className="clear-search-btn"
              onClick={handleClearSearch}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="toolbar-right">
        {/* Column Manager */}
        <div className="column-manager-container" ref={columnManagerRef}>
          <button
            className={`toolbar-btn ${showColumnManager ? 'active' : ''}`}
            onClick={() => setShowColumnManager(!showColumnManager)}
            title="Manage Columns"
          >
            ☰ Columns {hiddenColumns.size > 0 && `(${hiddenColumns.size} hidden)`}
          </button>
          
          {showColumnManager && data && (
            <div className="column-manager-dropdown">
              <div className="column-manager-header">
                <span>Show/Hide Columns</span>
                <button 
                  className="show-all-btn"
                  onClick={() => {
                    // Show all columns
                    hiddenColumns.forEach((col) => toggleColumnVisibility(col));
                  }}
                  disabled={hiddenColumns.size === 0}
                >
                  Show All
                </button>
              </div>
              <div className="column-manager-list">
                {data.columns.map((col) => (
                  <label key={col.name} className="column-checkbox">
                    <input
                      type="checkbox"
                      checked={!hiddenColumns.has(col.name)}
                      onChange={() => toggleColumnVisibility(col.name)}
                    />
                    <span className="column-checkbox-name">{col.name}</span>
                    <span className={`column-checkbox-type type-${col.type}`}>{col.type}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          className="toolbar-btn"
          onClick={handleReset}
          title="Reset View"
        >
          ↺ Reset
        </button>
        <button
          className="toolbar-btn"
          onClick={onRefresh}
          title="Refresh Data"
        >
          ⟳ Refresh
        </button>
      </div>
    </div>
  );
};

export default Toolbar;

