/**
 * Main App Component
 * Root component for the data viewer webview
 */

import React, { useEffect, useState, useCallback } from 'react';
import { DataGrid } from './components/DataGrid';
import { Toolbar } from './components/Toolbar';
import { StatusBar } from './components/StatusBar';
import { useVSCodeAPI } from './hooks/useVSCodeAPI';
import { useDataStore } from './store/dataStore';
import type { IDataFrame } from '../../core/types';

/**
 * App component - Main container for the data viewer
 */
const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { data, setData, theme, setTheme } = useDataStore();
  const vscode = useVSCodeAPI();

  // Handle messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      switch (message.type) {
        case 'setData':
          setData(message.payload as IDataFrame);
          setIsLoading(false);
          setError(null);
          break;

        case 'setTheme':
          setTheme(message.payload.theme);
          break;

        case 'setConfig':
          // Handle config updates (e.g., stats)
          break;

        case 'updateFilter':
          // Handle filter updates from extension
          break;

        case 'updateSelection':
          // Handle selection updates from extension
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    // Notify extension that webview is ready
    vscode.postMessage({ type: 'ready', payload: {} });

    return () => window.removeEventListener('message', handleMessage);
  }, [vscode, setData, setTheme]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    vscode.postMessage({ type: 'requestData', payload: {} });
  }, [vscode]);

  // Handle copy to clipboard
  const handleCopy = useCallback(
    (text: string) => {
      vscode.postMessage({ type: 'copyToClipboard', payload: { text } });
    },
    [vscode]
  );

  // Error state
  if (error) {
    return (
      <div className={`app ${theme}`}>
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <h2>Error Loading Data</h2>
          <p>{error}</p>
          <button onClick={handleRefresh}>Try Again</button>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={`app ${theme}`}>
        <div className="loading-container">
          <div className="loading-spinner" />
          <p>Loading data...</p>
        </div>
      </div>
    );
  }

  // No data state
  if (!data) {
    return (
      <div className={`app ${theme}`}>
        <div className="empty-container">
          <p>No data to display</p>
          <button onClick={handleRefresh}>Refresh</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`app ${theme}`}>
      <Toolbar dataFrameName={data.name} onRefresh={handleRefresh} />
      <div className="main-content">
        <DataGrid data={data} onCopy={handleCopy} />
      </div>
      <StatusBar
        rowCount={data.totalRows}
        columnCount={data.totalColumns}
        selectedCount={0}
      />
    </div>
  );
};

export default App;

