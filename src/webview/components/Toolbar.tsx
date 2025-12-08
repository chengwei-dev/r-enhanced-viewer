/**
 * Toolbar Component
 * Top toolbar with actions and search
 */

import React, { useState, useCallback } from 'react';
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
  const { filter, setFilter, resetView } = useDataStore();

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

