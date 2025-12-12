/**
 * Viewer Panel
 * Manages the VS Code webview panel for displaying data frames
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { IDataFrame, IWebviewToExtensionMessage, IExtensionToWebviewMessage } from '../../core/types';
import { dataProvider } from '../../core/dataProvider';
import { eventBus } from '../../core/eventBus';

/**
 * ViewerPanel class - Manages the webview for data viewing
 */
export class ViewerPanel {
  public static readonly viewType = 'rDataExplorer.viewer';
  private static panels: Map<string, ViewerPanel> = new Map();

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private dataFrameName: string;
  private disposables: vscode.Disposable[] = [];

  /**
   * Create or show viewer panel for a data frame
   */
  public static createOrShow(
    extensionUri: vscode.Uri,
    dataFrameName: string
  ): ViewerPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // Check if panel already exists
    const existing = ViewerPanel.panels.get(dataFrameName);
    if (existing) {
      existing.panel.reveal(column);
      return existing;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      ViewerPanel.viewType,
      `Data: ${dataFrameName}`,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        enableForms: false,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist', 'webview'),
        ],
      }
    );

    const viewerPanel = new ViewerPanel(panel, extensionUri, dataFrameName);
    ViewerPanel.panels.set(dataFrameName, viewerPanel);

    return viewerPanel;
  }

  /**
   * Constructor
   */
  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    dataFrameName: string
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.dataFrameName = dataFrameName;

    // Set up the webview content
    this.panel.webview.html = this.getHtmlContent();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      (message: IWebviewToExtensionMessage) => this.handleMessage(message),
      null,
      this.disposables
    );

    // Handle panel disposal
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Handle visibility changes
    this.panel.onDidChangeViewState(
      (e) => {
        if (e.webviewPanel.visible) {
          // Panel became visible, refresh data
          this.loadData();
        }
      },
      null,
      this.disposables
    );

    // Initial data load
    this.loadData();
  }

  /**
   * Reveal the panel with a new data frame
   */
  public reveal(dataFrameName: string): void {
    this.dataFrameName = dataFrameName;
    this.panel.title = `Data: ${dataFrameName}`;
    this.panel.reveal();
    this.loadData();
  }

  /**
   * Update data in the webview
   */
  public updateData(data: IDataFrame): void {
    this.postMessage({
      type: 'setData',
      payload: data,
    });
  }

  /**
   * Refresh data
   */
  public async refresh(): Promise<void> {
    await this.loadData(true);
  }

  /**
   * Dispose of the panel
   */
  public dispose(): void {
    ViewerPanel.panels.delete(this.dataFrameName);

    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  /**
   * Load data from R
   */
  private async loadData(forceRefresh = false): Promise<void> {
    try {
      const data = forceRefresh
        ? await dataProvider.refreshData(this.dataFrameName)
        : await dataProvider.getData(this.dataFrameName);

      this.updateData(data);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to load data frame "${this.dataFrameName}": ${(error as Error).message}`
      );
    }
  }

  /**
   * Handle messages from webview
   */
  private async handleMessage(message: IWebviewToExtensionMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        // Webview is ready, send initial data
        await this.loadData();
        this.sendTheme();
        break;

      case 'requestData':
        await this.loadData();
        break;

      case 'filter':
        await this.handleFilter(message.payload);
        break;

      case 'sort':
        await this.handleSort(message.payload);
        break;

      case 'selectCells':
        this.handleSelection(message.payload);
        break;

      case 'copyToClipboard':
        await this.handleCopy(message.payload);
        break;

      case 'requestStats':
        await this.handleStatsRequest(message.payload);
        break;

      case 'columnReorder':
        this.handleColumnReorder(message.payload);
        break;

      case 'columnResize':
        this.handleColumnResize(message.payload);
        break;
    }
  }

  /**
   * Handle filter request
   */
  private async handleFilter(payload: unknown): Promise<void> {
    // TODO: Implement filtering
    console.log('Filter request:', payload);
  }

  /**
   * Handle sort request
   */
  private async handleSort(payload: unknown): Promise<void> {
    // TODO: Implement sorting
    console.log('Sort request:', payload);
  }

  /**
   * Handle selection change
   */
  private handleSelection(payload: unknown): void {
    eventBus.emit('selection:changed', { selection: payload as any });
  }

  /**
   * Handle copy to clipboard
   */
  private async handleCopy(payload: unknown): Promise<void> {
    const { text } = payload as { text: string };
    await vscode.env.clipboard.writeText(text);
    vscode.window.showInformationMessage('Copied to clipboard');
  }

  /**
   * Handle statistics request
   */
  private async handleStatsRequest(payload: unknown): Promise<void> {
    const { columnName } = payload as { columnName: string };
    try {
      const stats = await dataProvider.getColumnStats(this.dataFrameName, columnName);
      this.postMessage({
        type: 'setConfig',
        payload: { stats: { [columnName]: stats } },
      });
    } catch (error) {
      console.error('Failed to get stats:', error);
    }
  }

  /**
   * Handle column reorder
   */
  private handleColumnReorder(payload: unknown): void {
    const { columns } = payload as { columns: string[] };
    eventBus.emit('columns:reordered', { columns });
  }

  /**
   * Handle column resize
   */
  private handleColumnResize(payload: unknown): void {
    // TODO: Persist column widths
    console.log('Column resize:', payload);
  }

  /**
   * Send theme to webview
   */
  private sendTheme(): void {
    const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark
      ? 'dark'
      : 'light';

    this.postMessage({
      type: 'setTheme',
      payload: { theme },
    });
  }

  /**
   * Post message to webview
   */
  private postMessage(message: IExtensionToWebviewMessage): void {
    this.panel.webview.postMessage(message);
  }

  /**
   * Get HTML content for webview
   */
  private getHtmlContent(): string {
    const webview = this.panel.webview;
    const nonce = this.getNonce();

    // All-in-one HTML with inline styles and scripts
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>R Data Explorer</title>
    <style>
      :root {
        --bg-primary: #1e1e1e;
        --bg-secondary: #252526;
        --bg-hover: #3c3c3c;
        --text-primary: #cccccc;
        --text-muted: #6e6e6e;
        --border-color: #3c3c3c;
        --accent: #007acc;
        --cell-numeric: #b5cea8;
        --cell-character: #ce9178;
        --cell-na: #808080;
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { height: 100%; overflow: hidden; }
      body { 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        background: var(--bg-primary);
        color: var(--text-primary);
        display: flex;
        flex-direction: column;
      }
      .toolbar {
        height: 44px;
        display: flex;
        align-items: center;
        padding: 0 12px;
        background: var(--bg-secondary);
        border-bottom: 1px solid var(--border-color);
        gap: 12px;
      }
      .filter-chips-container {
        min-height: 32px;
        display: flex;
        align-items: center;
        padding: 4px 12px;
        background: var(--bg-secondary);
        border-bottom: 1px solid var(--border-color);
        gap: 8px;
        flex-wrap: wrap;
      }
      .filter-chips-container.hidden { display: none; }
      .filter-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        background: var(--accent);
        color: white;
        border-radius: 12px;
        font-size: 11px;
      }
      .filter-chip-remove {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
        padding: 0;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .filter-chip-remove:hover {
        background: rgba(255, 255, 255, 0.2);
      }
      .filter-logic {
        font-size: 10px;
        color: var(--text-muted);
        font-weight: 600;
      }
      .toolbar-title { font-weight: 600; font-size: 14px; }
      .toolbar-btn {
        height: 28px;
        padding: 0 12px;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        background: var(--bg-secondary);
        color: var(--text-primary);
        cursor: pointer;
      }
      .toolbar-btn:hover { background: var(--bg-hover); border-color: var(--accent); }
      .search-input {
        height: 28px;
        padding: 0 8px;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        background: var(--bg-primary);
        color: var(--text-primary);
        width: 200px;
      }
      .search-input:focus { outline: none; border-color: var(--accent); }
      .main { flex: 1; overflow: auto; }
      table { width: 100%; border-collapse: collapse; font-family: 'SF Mono', Monaco, Consolas, monospace; font-size: 12px; }
      thead { position: sticky; top: 0; z-index: 10; background: var(--bg-secondary); }
      th { 
        padding: 8px; 
        text-align: left; 
        border-bottom: 2px solid var(--border-color);
        border-right: 1px solid var(--border-color);
        font-weight: 600;
        white-space: nowrap;
        cursor: pointer;
        user-select: none;
        position: relative;
      }
      th:hover { background: var(--bg-hover); }
      th.sorted { background: var(--bg-tertiary); }
      .col-header { display: flex; flex-direction: column; gap: 2px; }
      .col-name-row { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
      .col-type { font-size: 10px; color: var(--text-muted); font-weight: normal; }
      .sort-indicator { 
        font-size: 12px; 
        color: var(--accent); 
        margin-left: 4px;
        display: inline-flex;
        align-items: center;
      }
      .sort-indicator.inactive {
        color: var(--text-muted);
        opacity: 0.5;
      }
      th:hover .sort-indicator.inactive {
        opacity: 1;
      }
      .sort-priority { 
        font-size: 9px; 
        vertical-align: super;
        color: var(--accent);
      }
      td { 
        padding: 6px 8px; 
        border-bottom: 1px solid var(--border-color);
        border-right: 1px solid var(--border-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 200px;
        cursor: pointer;
        position: relative;
      }
      td.selected {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
        background: rgba(0, 122, 204, 0.1);
      }
      td:hover::after {
        content: 'Press E to filter';
        position: absolute;
        bottom: -20px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--bg-tertiary);
        color: var(--text-primary);
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 10px;
        white-space: nowrap;
        z-index: 100;
        pointer-events: none;
      }
      tr:nth-child(even) { background: var(--bg-secondary); }
      tr:hover { background: var(--bg-hover); }
      .row-num { color: var(--text-muted); text-align: center; width: 50px; background: var(--bg-secondary); }
      .cell-numeric { color: var(--cell-numeric); text-align: right; }
      .cell-character { color: var(--cell-character); }
      .cell-na { color: var(--cell-na); font-style: italic; }
      .status-bar {
        height: 28px;
        display: flex;
        align-items: center;
        padding: 0 12px;
        background: var(--bg-secondary);
        border-top: 1px solid var(--border-color);
        font-size: 12px;
        color: var(--text-muted);
      }
      .loading { display: flex; justify-content: center; align-items: center; height: 100%; color: var(--text-muted); }
    </style>
</head>
<body>
    <div class="toolbar">
      <span class="toolbar-title" id="title">📊 Loading...</span>
      <input type="text" class="search-input" id="search" placeholder="Search...">
      <button class="toolbar-btn" id="refresh">⟳ Refresh</button>
    </div>
    <div class="filter-chips-container hidden" id="filter-chips"></div>
    <div class="main" id="main">
      <div class="loading">Loading data...</div>
    </div>
    <div class="status-bar">
      <span id="status">Ready</span>
    </div>

    <script nonce="${nonce}">
      (function() {
        const vscode = acquireVsCodeApi();
        let currentData = null;
        let filteredRows = null;
        let sortState = { columns: [] };
        let selectedCell = null;  // { rowIndex, columnIndex, value, columnName }
        let quickFilterState = { enabled: false, filters: [], logic: 'AND' };

        // DOM elements
        const titleEl = document.getElementById('title');
        const mainEl = document.getElementById('main');
        const statusEl = document.getElementById('status');
        const searchEl = document.getElementById('search');
        const refreshBtn = document.getElementById('refresh');
        const filterChipsEl = document.getElementById('filter-chips');

        // Render table
        function renderTable(data) {
          if (!data || !data.columns || !data.rows) {
            mainEl.innerHTML = '<div class="loading">No data available</div>';
            return;
          }

          const rows = filteredRows || data.rows;
          
          let html = '<table><thead><tr><th class="row-num">#</th>';
          data.columns.forEach((col, colIdx) => {
            const sortCol = sortState.columns.find(s => s.columnName === col.name);
            const sortClass = sortCol ? 'sorted' : '';
            const sortIcon = sortCol ? (sortCol.direction === 'asc' ? '↑' : '↓') : '↕';
            const sortIndicatorClass = sortCol ? 'sort-indicator' : 'sort-indicator inactive';
            const sortPriority = sortCol && sortState.columns.length > 1 ? '<span class="sort-priority">' + sortCol.priority + '</span>' : '';
            
            html += '<th class="' + sortClass + '" data-col-idx="' + colIdx + '" data-col-name="' + escapeHtml(col.name) + '">';
            html += '<div class="col-header">';
            html += '<div class="col-name-row">';
            html += '<span>' + escapeHtml(col.name) + '</span>';
            html += '<span class="' + sortIndicatorClass + '">' + sortIcon + sortPriority + '</span>';
            html += '</div>';
            html += '<div class="col-type">' + col.type + '</div>';
            html += '</div>';
            html += '</th>';
          });
          html += '</tr></thead><tbody>';

          rows.forEach((row, idx) => {
            html += '<tr><td class="row-num">' + (idx + 1) + '</td>';
            data.columns.forEach((col, colIdx) => {
              const value = Array.isArray(row) ? row[colIdx] : row[col.name];
              const cellClass = getCellClass(value, col.type);
              const displayValue = formatValue(value, col.type);
              const isSelected = selectedCell && selectedCell.rowIndex === idx && selectedCell.columnIndex === colIdx;
              html += '<td class="' + cellClass + (isSelected ? ' selected' : '') + '" data-row="' + idx + '" data-col="' + colIdx + '">' + escapeHtml(displayValue) + '</td>';
            });
            html += '</tr>';
          });

          html += '</tbody></table>';
          mainEl.innerHTML = html;
          
          // Add click handlers to column headers
          const headers = mainEl.querySelectorAll('th[data-col-name]');
          headers.forEach(th => {
            th.addEventListener('click', function(e) {
              const columnName = this.getAttribute('data-col-name');
              const colIdx = parseInt(this.getAttribute('data-col-idx'));
              handleColumnClick(e, columnName, data.columns[colIdx].type);
            });
          });
          
          // Add click handlers to table cells
          const cells = mainEl.querySelectorAll('td[data-row][data-col]');
          cells.forEach(td => {
            td.addEventListener('click', function() {
              const rowIndex = parseInt(this.getAttribute('data-row'));
              const columnIndex = parseInt(this.getAttribute('data-col'));
              handleCellClick(rowIndex, columnIndex);
            });
          });
        }

        function getCellClass(value, type) {
          if (value === null || value === undefined) return 'cell-na';
          if (type === 'numeric' || type === 'integer') return 'cell-numeric';
          if (type === 'character') return 'cell-character';
          return '';
        }

        function formatValue(value, type) {
          if (value === null || value === undefined) return 'NA';
          if (typeof value === 'number' && !Number.isInteger(value)) {
            return value.toFixed(4).replace(/\\.?0+$/, '');
          }
          return String(value);
        }

        function escapeHtml(str) {
          const div = document.createElement('div');
          div.textContent = str;
          return div.innerHTML;
        }

        // Cell selection handling
        function handleCellClick(rowIndex, columnIndex) {
          const rows = filteredRows || currentData.rows;
          const row = rows[rowIndex];
          const value = Array.isArray(row) ? row[columnIndex] : row[currentData.columns[columnIndex].name];
          const columnName = currentData.columns[columnIndex].name;
          
          selectedCell = {
            rowIndex,
            columnIndex,
            value,
            columnName,
            columnType: currentData.columns[columnIndex].type
          };
          
          renderTable(currentData);
        }

        // Sort handling
        function handleColumnClick(event, columnName, columnType) {
          const isShift = event.shiftKey;
          
          if (!isShift) {
            // Single column sort - replace existing or toggle
            const existing = sortState.columns.find(c => c.columnName === columnName);
            if (existing) {
              if (existing.direction === 'asc') {
                existing.direction = 'desc';
                sortState.columns = [existing];
              } else {
                // Third click - remove sort
                sortState.columns = [];
              }
            } else {
              sortState.columns = [{ columnName, direction: 'asc', priority: 1 }];
            }
          } else {
            // Multi-column sort - add to existing
            const existing = sortState.columns.find(c => c.columnName === columnName);
            if (existing) {
              // Toggle direction
              existing.direction = existing.direction === 'asc' ? 'desc' : 'asc';
            } else {
              // Add new sort column
              sortState.columns.push({ 
                columnName, 
                direction: 'asc', 
                priority: sortState.columns.length + 1 
              });
            }
          }
          
          // Update priorities
          sortState.columns.forEach((col, idx) => {
            col.priority = idx + 1;
          });
          
          applySortAndRender();
        }

        function applySortAndRender() {
          // If filters are active, re-apply filters (which also applies sort)
          if (quickFilterState.enabled && quickFilterState.filters.length > 0) {
            applyQuickFiltersAndRender();
            return;
          }
          
          // No filters - just apply sort to original data
          if (sortState.columns.length === 0) {
            filteredRows = null;
          } else {
            filteredRows = sortRows(currentData.rows, sortState, currentData.columns);
          }
          
          renderTable(currentData);
          updateStatus();
        }

        function sortRows(rows, sortState, columns) {
          if (sortState.columns.length === 0) return rows;
          
          const sortedRows = [...rows];
          
          sortedRows.sort((a, b) => {
            for (const sortCol of sortState.columns) {
              const colIdx = columns.findIndex(c => c.name === sortCol.columnName);
              if (colIdx === -1) continue;
              
              const aVal = Array.isArray(a) ? a[colIdx] : a[sortCol.columnName];
              const bVal = Array.isArray(b) ? b[colIdx] : b[sortCol.columnName];
              const colType = columns[colIdx].type;
              
              // Handle NA values - always sort to bottom
              if (aVal === null || aVal === undefined) return 1;
              if (bVal === null || bVal === undefined) return -1;
              
              let comparison = 0;
              
              // Type-specific comparison
              if (colType === 'numeric' || colType === 'integer') {
                comparison = Number(aVal) - Number(bVal);
              } else if (colType === 'Date' || colType === 'POSIXct' || colType === 'POSIXlt') {
                comparison = new Date(aVal).getTime() - new Date(bVal).getTime();
              } else {
                // String comparison
                comparison = String(aVal).localeCompare(String(bVal));
              }
              
              if (comparison !== 0) {
                return sortCol.direction === 'asc' ? comparison : -comparison;
              }
            }
            return 0;
          });
          
          return sortedRows;
        }

        // Quick filter handling
        function applyQuickFiltersAndRender() {
          renderFilterChips();
          
          if (!quickFilterState.enabled || quickFilterState.filters.length === 0) {
            filteredRows = null;
            renderTable(currentData);
            updateStatus();
            return;
          }
          
          // Apply filters
          filteredRows = currentData.rows.filter(row => {
            if (quickFilterState.logic === 'AND') {
              return quickFilterState.filters.every(filter => matchesFilter(row, filter));
            } else {
              return quickFilterState.filters.some(filter => matchesFilter(row, filter));
            }
          });
          
          // Apply sort to filtered rows
          if (sortState.columns.length > 0) {
            filteredRows = sortRows(filteredRows, sortState, currentData.columns);
          }
          
          renderTable(currentData);
          updateStatus();
        }
        
        function renderFilterChips() {
          if (!quickFilterState.enabled || quickFilterState.filters.length === 0) {
            filterChipsEl.classList.add('hidden');
            filterChipsEl.innerHTML = '';
            return;
          }
          
          filterChipsEl.classList.remove('hidden');
          
          let html = '';
          quickFilterState.filters.forEach((filter, idx) => {
            if (idx > 0) {
              html += '<span class="filter-logic">' + quickFilterState.logic + '</span>';
            }
            const operatorSymbol = filter.operator === 'eq' ? '==' : 
                                  filter.operator === 'ne' ? '!=' :
                                  filter.operator === 'gt' ? '>' :
                                  filter.operator === 'lt' ? '<' : '~';
            html += '<div class="filter-chip">';
            html += '<span>' + escapeHtml(filter.columnName) + ' ' + operatorSymbol + ' ' + escapeHtml(String(filter.value)) + '</span>';
            html += '<button class="filter-chip-remove" data-filter-idx="' + idx + '">×</button>';
            html += '</div>';
          });
          
          filterChipsEl.innerHTML = html;
          
          // Add click handlers to remove buttons
          const removeButtons = filterChipsEl.querySelectorAll('.filter-chip-remove');
          removeButtons.forEach(btn => {
            btn.addEventListener('click', function() {
              const idx = parseInt(this.getAttribute('data-filter-idx'));
              removeFilter(idx);
            });
          });
        }
        
        function removeFilter(index) {
          quickFilterState.filters.splice(index, 1);
          if (quickFilterState.filters.length === 0) {
            quickFilterState.enabled = false;
          }
          applyQuickFiltersAndRender();
        }
        
        function matchesFilter(row, filter) {
          const colIdx = currentData.columns.findIndex(c => c.name === filter.columnName);
          if (colIdx === -1) return false;
          
          const value = Array.isArray(row) ? row[colIdx] : row[filter.columnName];
          
          switch (filter.operator) {
            case 'eq':
              return value === filter.value;
            case 'ne':
              return value !== filter.value;
            case 'gt':
              return value > filter.value;
            case 'lt':
              return value < filter.value;
            case 'contains':
              return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
            default:
              return false;
          }
        }

        // Search/filter (global search box)
        searchEl.addEventListener('input', function(e) {
          const query = e.target.value.toLowerCase();
          
          // Start with original or quick-filtered data
          let baseRows = currentData.rows;
          if (quickFilterState.enabled && quickFilterState.filters.length > 0) {
            baseRows = currentData.rows.filter(row => {
              if (quickFilterState.logic === 'AND') {
                return quickFilterState.filters.every(filter => matchesFilter(row, filter));
              } else {
                return quickFilterState.filters.some(filter => matchesFilter(row, filter));
              }
            });
          }
          
          if (!query) {
            filteredRows = quickFilterState.enabled ? baseRows : null;
          } else {
            // Apply search to base rows
            filteredRows = baseRows.filter(row => {
              return currentData.columns.some((col, idx) => {
                const value = Array.isArray(row) ? row[idx] : row[col.name];
                return String(value).toLowerCase().includes(query);
              });
            });
          }
          
          // Apply sort to filtered rows
          if (filteredRows && sortState.columns.length > 0) {
            filteredRows = sortRows(filteredRows, sortState, currentData.columns);
          }
          
          renderTable(currentData);
          updateStatus();
        });

        // Refresh
        refreshBtn.addEventListener('click', function() {
          vscode.postMessage({ type: 'requestData', payload: {} });
        });

        // Update status bar
        function updateStatus() {
          if (!currentData) return;
          const total = currentData.totalRows;
          const shown = filteredRows ? filteredRows.length : currentData.rows.length;
          statusEl.textContent = 'Rows: ' + shown + (filteredRows ? ' / ' + total : '') + ' | Columns: ' + currentData.totalColumns;
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', function(e) {
          // E key - Equal filter (requires selected cell)
          if ((e.key === 'e' || e.key === 'E') && selectedCell) {
            e.preventDefault();
            const isShift = e.shiftKey;
            
            const newFilter = {
              columnName: selectedCell.columnName,
              operator: 'eq',
              value: selectedCell.value
            };
            
            if (!isShift) {
              // Replace all filters
              quickFilterState.filters = [newFilter];
            } else {
              // Add to existing filters
              quickFilterState.filters.push(newFilter);
            }
            
            quickFilterState.enabled = true;
            applyQuickFiltersAndRender();
            return;
          }
          
          // Esc key - Clear filters and selection
          if (e.key === 'Escape') {
            quickFilterState = { enabled: false, filters: [], logic: 'AND' };
            selectedCell = null;
            filteredRows = null;
            searchEl.value = '';
            renderTable(currentData);
            updateStatus();
            return;
          }
          
          // Navigation shortcuts
          if (!currentData) return;
          
          const rows = filteredRows || currentData.rows;
          const numRows = rows.length;
          const numCols = currentData.columns.length;
          
          // Home - First row
          if (e.key === 'Home' && !e.ctrlKey) {
            e.preventDefault();
            if (selectedCell) {
              handleCellClick(0, selectedCell.columnIndex);
              scrollToCell(0, selectedCell.columnIndex);
            }
            return;
          }
          
          // End - Last row
          if (e.key === 'End' && !e.ctrlKey) {
            e.preventDefault();
            if (selectedCell) {
              handleCellClick(numRows - 1, selectedCell.columnIndex);
              scrollToCell(numRows - 1, selectedCell.columnIndex);
            }
            return;
          }
          
          // Ctrl+Home - First column
          if (e.key === 'Home' && e.ctrlKey) {
            e.preventDefault();
            if (selectedCell) {
              handleCellClick(selectedCell.rowIndex, 0);
              scrollToCell(selectedCell.rowIndex, 0);
            }
            return;
          }
          
          // Ctrl+End - Last column
          if (e.key === 'End' && e.ctrlKey) {
            e.preventDefault();
            if (selectedCell) {
              handleCellClick(selectedCell.rowIndex, numCols - 1);
              scrollToCell(selectedCell.rowIndex, numCols - 1);
            }
            return;
          }
          
          // Arrow keys - Navigate cells
          if (selectedCell && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
            let newRow = selectedCell.rowIndex;
            let newCol = selectedCell.columnIndex;
            
            if (e.key === 'ArrowUp' && newRow > 0) newRow--;
            if (e.key === 'ArrowDown' && newRow < numRows - 1) newRow++;
            if (e.key === 'ArrowLeft' && newCol > 0) newCol--;
            if (e.key === 'ArrowRight' && newCol < numCols - 1) newCol++;
            
            if (newRow !== selectedCell.rowIndex || newCol !== selectedCell.columnIndex) {
              handleCellClick(newRow, newCol);
              scrollToCell(newRow, newCol);
            }
            return;
          }
        });
        
        // Scroll to cell helper
        function scrollToCell(rowIndex, columnIndex) {
          const cell = mainEl.querySelector('td[data-row="' + rowIndex + '"][data-col="' + columnIndex + '"]');
          if (cell) {
            cell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
          }
        }

        // Handle messages from extension
        window.addEventListener('message', function(event) {
          const message = event.data;
          switch (message.type) {
            case 'setData':
              currentData = message.payload;
              filteredRows = null;
              sortState = { columns: [] };  // Reset sort on new data
              titleEl.textContent = '📊 ' + currentData.name;
              renderTable(currentData);
              updateStatus();
              break;
            case 'setTheme':
              // Could handle theme changes here
              break;
          }
        });

        // Notify extension that webview is ready
        vscode.postMessage({ type: 'ready', payload: {} });
      })();
    </script>
</body>
</html>`;
  }

  /**
   * Generate a nonce for script security
   */
  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}

