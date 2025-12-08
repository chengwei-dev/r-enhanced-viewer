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
      }
      th:hover { background: var(--bg-hover); }
      .col-type { font-size: 10px; color: var(--text-muted); font-weight: normal; }
      td { 
        padding: 6px 8px; 
        border-bottom: 1px solid var(--border-color);
        border-right: 1px solid var(--border-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 200px;
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

        // DOM elements
        const titleEl = document.getElementById('title');
        const mainEl = document.getElementById('main');
        const statusEl = document.getElementById('status');
        const searchEl = document.getElementById('search');
        const refreshBtn = document.getElementById('refresh');

        // Render table
        function renderTable(data) {
          if (!data || !data.columns || !data.rows) {
            mainEl.innerHTML = '<div class="loading">No data available</div>';
            return;
          }

          const rows = filteredRows || data.rows;
          
          let html = '<table><thead><tr><th class="row-num">#</th>';
          data.columns.forEach(col => {
            html += '<th>' + escapeHtml(col.name) + '<div class="col-type">' + col.type + '</div></th>';
          });
          html += '</tr></thead><tbody>';

          rows.forEach((row, idx) => {
            html += '<tr><td class="row-num">' + (idx + 1) + '</td>';
            data.columns.forEach((col, colIdx) => {
              const value = Array.isArray(row) ? row[colIdx] : row[col.name];
              const cellClass = getCellClass(value, col.type);
              const displayValue = formatValue(value, col.type);
              html += '<td class="' + cellClass + '">' + escapeHtml(displayValue) + '</td>';
            });
            html += '</tr>';
          });

          html += '</tbody></table>';
          mainEl.innerHTML = html;
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

        // Search/filter
        searchEl.addEventListener('input', function(e) {
          const query = e.target.value.toLowerCase();
          if (!query) {
            filteredRows = null;
          } else {
            filteredRows = currentData.rows.filter(row => {
              return currentData.columns.some((col, idx) => {
                const value = Array.isArray(row) ? row[idx] : row[col.name];
                return String(value).toLowerCase().includes(query);
              });
            });
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

        // Handle messages from extension
        window.addEventListener('message', function(event) {
          const message = event.data;
          switch (message.type) {
            case 'setData':
              currentData = message.payload;
              filteredRows = null;
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

