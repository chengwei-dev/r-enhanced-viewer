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
  public static readonly viewType = 'reviewer.viewer';
  private static panels: Map<string, ViewerPanel> = new Map();

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private dataFrameName: string;
  private disposables: vscode.Disposable[] = [];
  private pendingData: IDataFrame | null = null;
  private hasReceivedData: boolean = false;  // Track if data was received via HTTP

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
   * Create or show viewer panel with data directly (from HTTP server)
   * This is used when data is received from R's REView() function
   */
  public static createOrShowWithData(
    extensionUri: vscode.Uri,
    data: IDataFrame
  ): ViewerPanel {
    console.log(`[ViewerPanel] createOrShowWithData called for "${data.name}"`);
    console.log(`[ViewerPanel] Data has ${data.totalRows} rows, ${data.totalColumns} columns`);
    
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // Check if panel already exists for this data frame
    const existing = ViewerPanel.panels.get(data.name);
    if (existing) {
      console.log(`[ViewerPanel] Found existing panel for "${data.name}"`);
      existing.panel.reveal(column);
      existing.pendingData = data;  // Store data in case webview sends ready message
      existing.hasReceivedData = true;  // Mark that we received data via HTTP
      existing.updateData(data);
      return existing;
    }
    
    console.log(`[ViewerPanel] Creating new panel for "${data.name}"`)

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      ViewerPanel.viewType,
      `Data: ${data.name}`,
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

    const viewerPanel = new ViewerPanel(panel, extensionUri, data.name, data);
    ViewerPanel.panels.set(data.name, viewerPanel);

    return viewerPanel;
  }

  /**
   * Constructor
   */
  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    dataFrameName: string,
    initialData?: IDataFrame
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.dataFrameName = dataFrameName;
    this.pendingData = initialData || null;
    this.hasReceivedData = !!initialData;  // Mark if we received data via HTTP

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
          // Panel became visible, only load data if we don't have pending data
          // and didn't receive data via HTTP
          if (!this.pendingData && !this.hasReceivedData) {
            this.loadData();
          }
        }
      },
      null,
      this.disposables
    );

    // Initial data load (if we have pending data, it will be sent when webview is ready)
    if (!this.pendingData) {
      this.loadData();
    }
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
        console.log(`[ViewerPanel] Webview ready. pendingData: ${!!this.pendingData}, hasReceivedData: ${this.hasReceivedData}`);
        if (this.pendingData) {
          // Use pending data from HTTP server
          console.log(`[ViewerPanel] Sending pending data to webview`);
          this.updateData(this.pendingData);
          this.pendingData = null;
          // hasReceivedData stays true, so we won't call loadData later
        } else if (!this.hasReceivedData) {
          // Only load from dataProvider if we didn't receive data via HTTP
          console.log(`[ViewerPanel] No pending data and not received via HTTP, calling loadData()`);
          await this.loadData();
        } else {
          console.log(`[ViewerPanel] No pending data but hasReceivedData is true, skipping loadData()`);
        }
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
    <title>R Enhanced Viewer</title>
    <style>
      :root {
        --bg-primary: #1e1e1e;
        --bg-secondary: #252526;
        --bg-tertiary: #2d2d30;
        --bg-hover: #3c3c3c;
        --text-primary: #cccccc;
        --text-muted: #6e6e6e;
        --border-color: #3c3c3c;
        --accent: #007acc;
        --cell-numeric: #b5cea8;
        --cell-character: #ce9178;
        --cell-na: #808080;
      }
      /* Light theme */
      body.light-theme {
        --bg-primary: #ffffff;
        --bg-secondary: #f5f5f5;
        --bg-tertiary: #e8e8e8;
        --bg-hover: #e0e0e0;
        --text-primary: #333333;
        --text-muted: #666666;
        --border-color: #d0d0d0;
        --accent: #0066cc;
        --cell-numeric: #098658;
        --cell-character: #a31515;
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
      .content-wrapper {
        display: flex;
        flex: 1;
        overflow: hidden;
      }
      .main-panel {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      /* Frequency Panel Styles */
      .freq-panel-wrapper {
        display: flex;
        position: relative;
      }
      .freq-panel-wrapper.hidden { display: none; }
      .freq-panel-resizer {
        width: 5px;
        background: var(--border-color);
        cursor: col-resize;
        flex-shrink: 0;
        transition: background 0.15s;
      }
      .freq-panel-resizer:hover,
      .freq-panel-resizer.dragging {
        background: var(--accent-color, #007acc);
      }
      .freq-panel {
        width: 280px;
        min-width: 180px;
        max-width: 600px;
        background: var(--bg-secondary);
        border-left: 1px solid var(--border-color);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .freq-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-bottom: 1px solid var(--border-color);
        background: var(--bg-tertiary);
      }
      .freq-panel-title {
        font-weight: 600;
        font-size: 12px;
      }
      .freq-panel-close {
        background: none;
        border: none;
        color: var(--text-muted);
        cursor: pointer;
        font-size: 16px;
        padding: 2px 6px;
        border-radius: 3px;
      }
      .freq-panel-close:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
      }
      .freq-panel-content {
        flex: 1;
        overflow-y: auto;
        padding: 8px 0;
      }
      .freq-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
      }
      .freq-table th {
        text-align: left;
        padding: 6px 12px;
        border-bottom: 1px solid var(--border-color);
        font-weight: 600;
        position: sticky;
        top: 0;
        background: var(--bg-secondary);
      }
      .freq-table td {
        padding: 4px 12px;
        border-bottom: 1px solid var(--border-color);
      }
      .freq-table tr:hover {
        background: var(--bg-hover);
        cursor: pointer;
      }
      .freq-value { color: var(--cell-character); }
      .freq-count { text-align: right; color: var(--cell-numeric); }
      .freq-percent { text-align: right; color: var(--text-muted); }
      .numeric-stats {
        padding: 12px;
      }
      .stat-row {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
        border-bottom: 1px solid var(--border-color);
      }
      .stat-label { color: var(--text-muted); }
      .stat-value { color: var(--cell-numeric); font-weight: 500; }
      /* Variable Selector Modal */
      .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }
      .modal-overlay.hidden { display: none; }
      .modal {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        width: 500px;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      }
      .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border-color);
      }
      .modal-title { font-weight: 600; font-size: 14px; }
      .modal-close {
        background: none;
        border: none;
        color: var(--text-muted);
        cursor: pointer;
        font-size: 18px;
        padding: 2px 6px;
      }
      .modal-close:hover { color: var(--text-primary); }
      .modal-body {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
      }
      .var-search {
        width: 100%;
        padding: 8px;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        background: var(--bg-primary);
        color: var(--text-primary);
        margin-bottom: 12px;
      }
      .var-actions {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
      }
      .var-actions button {
        padding: 4px 12px;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        background: var(--bg-tertiary);
        color: var(--text-primary);
        cursor: pointer;
        font-size: 11px;
      }
      .var-actions button:hover { background: var(--bg-hover); }
      .var-list {
        border: 1px solid var(--border-color);
        border-radius: 4px;
        max-height: 60vh;
        min-height: 400px;
        overflow-y: auto;
      }
      .var-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-bottom: 1px solid var(--border-color);
        cursor: pointer;
      }
      .var-item:last-child { border-bottom: none; }
      .var-item:hover { background: var(--bg-hover); }
      .var-item.selected { background: rgba(0, 122, 204, 0.2); }
      .var-item input[type="checkbox"] { cursor: pointer; }
      .var-name { flex: 1; }
      .var-type { font-size: 10px; color: var(--text-muted); }
      .var-drag-handle {
        color: var(--text-muted);
        cursor: grab;
        padding: 0 4px;
      }
      .var-drag-handle:active { cursor: grabbing; }
      .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid var(--border-color);
      }
      .modal-footer button {
        padding: 6px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }
      .btn-primary {
        background: var(--accent);
        color: white;
        border: none;
      }
      .btn-primary:hover { background: #1e90ff; }
      .btn-secondary {
        background: var(--bg-tertiary);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
      }
      .btn-secondary:hover { background: var(--bg-hover); }
      /* Search Dialog */
      .search-dialog {
        position: fixed;
        top: 60px;
        right: 20px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        padding: 12px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 1000;
        width: 300px;
      }
      .search-dialog.hidden { display: none; }
      .search-dialog-input {
        width: 100%;
        padding: 8px;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: 13px;
      }
      .search-dialog-input:focus { outline: none; border-color: var(--accent); }
      .search-dialog-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 8px;
        font-size: 11px;
        color: var(--text-muted);
      }
      .search-dialog-nav button {
        background: none;
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        padding: 2px 8px;
        border-radius: 3px;
        cursor: pointer;
        margin-left: 4px;
      }
      .search-dialog-nav button:hover { background: var(--bg-hover); }
      .search-dialog-nav button:disabled { opacity: 0.5; cursor: not-allowed; }
      td.search-match { background: rgba(255, 200, 0, 0.3); }
      td.search-current { background: rgba(255, 200, 0, 0.6); outline: 2px solid #ffcc00; }
      /* Jump to Row Dialog */
      .jump-dialog {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        padding: 16px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        z-index: 1000;
        width: 260px;
      }
      .jump-dialog.hidden { display: none; }
      .jump-dialog-title {
        font-weight: 600;
        margin-bottom: 12px;
        color: var(--text-primary);
      }
      .jump-dialog-input {
        width: 100%;
        padding: 8px;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: 14px;
        text-align: center;
      }
      .jump-dialog-input:focus { outline: none; border-color: var(--accent); }
      .jump-dialog-hint {
        margin-top: 8px;
        font-size: 11px;
        color: var(--text-muted);
        text-align: center;
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
      .theme-toggle { 
        margin-left: auto; 
        font-size: 16px; 
        padding: 0 10px;
      }
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
        content: 'E: filter | Ctrl+click: multi-select | I: IN filter';
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
      <button class="toolbar-btn" id="select-vars">☰ Variables</button>
      <button class="toolbar-btn" id="refresh">⟳ Refresh</button>
      <button class="toolbar-btn theme-toggle" id="theme-toggle" title="Toggle Light/Dark Theme">🌙</button>
    </div>
    <div class="filter-chips-container hidden" id="filter-chips"></div>
    <div class="content-wrapper">
      <div class="main-panel">
        <div class="main" id="main">
          <div class="loading">Loading data...</div>
        </div>
      </div>
      <div class="freq-panel-wrapper hidden" id="freq-panel-wrapper">
        <div class="freq-panel-resizer" id="freq-resizer"></div>
        <div class="freq-panel" id="freq-panel">
          <div class="freq-panel-header">
            <span class="freq-panel-title" id="freq-title">Frequency</span>
            <button class="freq-panel-close" id="freq-close">×</button>
          </div>
          <div class="freq-panel-content" id="freq-content"></div>
        </div>
      </div>
    </div>
    <div class="status-bar">
      <span id="status">Ready</span>
    </div>
    
    <!-- Variable Selector Modal -->
    <div class="modal-overlay hidden" id="var-modal">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Select Variables</span>
          <button class="modal-close" id="var-modal-close">×</button>
        </div>
        <div class="modal-body">
          <input type="text" class="var-search" id="var-search" placeholder="Search variables...">
          <div class="var-actions">
            <button id="var-select-all">Select All</button>
            <button id="var-select-none">Select None</button>
          </div>
          <div class="var-list" id="var-list"></div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" id="var-cancel">Cancel</button>
          <button class="btn-primary" id="var-apply">Apply</button>
        </div>
      </div>
    </div>
    
    <!-- Search Dialog (Ctrl+F) -->
    <div class="search-dialog hidden" id="search-dialog">
      <input type="text" class="search-dialog-input" id="search-dialog-input" placeholder="Find in table...">
      <div class="search-dialog-info">
        <span id="search-dialog-count">0 matches</span>
        <div class="search-dialog-nav">
          <button id="search-prev">↑</button>
          <button id="search-next">↓</button>
          <button id="search-close">×</button>
        </div>
      </div>
    </div>
    
    <!-- Jump to Row Dialog (Ctrl+G) -->
    <div class="jump-dialog hidden" id="jump-dialog">
      <div class="jump-dialog-title">Go to Row</div>
      <input type="number" class="jump-dialog-input" id="jump-input" placeholder="Row number">
      <div class="jump-dialog-hint">Press Enter to jump, Esc to cancel</div>
    </div>

    <script nonce="${nonce}">
      (function() {
        const vscode = acquireVsCodeApi();
        let currentData = null;
        let filteredRows = null;
        let sortState = { columns: [] };
        let selectedCell = null;  // { rowIndex, columnIndex, value, columnName }
        let selectedCells = [];   // Array for multi-select: [{ rowIndex, columnIndex, value, columnName }]
        let quickFilterState = { enabled: false, filters: [], logic: 'AND' };

        // DOM elements
        const titleEl = document.getElementById('title');
        const mainEl = document.getElementById('main');
        const statusEl = document.getElementById('status');
        const searchEl = document.getElementById('search');
        const refreshBtn = document.getElementById('refresh');
        const filterChipsEl = document.getElementById('filter-chips');
        const themeToggleBtn = document.getElementById('theme-toggle');
        
        // Theme state
        let isDarkTheme = true;
        
        // Frequency panel elements
        const freqPanelWrapper = document.getElementById('freq-panel-wrapper');
        const freqPanel = document.getElementById('freq-panel');
        const freqResizer = document.getElementById('freq-resizer');
        const freqTitle = document.getElementById('freq-title');
        const freqContent = document.getElementById('freq-content');
        const freqCloseBtn = document.getElementById('freq-close');
        
        // Variable selector elements
        const varModal = document.getElementById('var-modal');
        const varList = document.getElementById('var-list');
        const varSearch = document.getElementById('var-search');
        const selectVarsBtn = document.getElementById('select-vars');
        const varModalCloseBtn = document.getElementById('var-modal-close');
        const varSelectAllBtn = document.getElementById('var-select-all');
        const varSelectNoneBtn = document.getElementById('var-select-none');
        const varCancelBtn = document.getElementById('var-cancel');
        const varApplyBtn = document.getElementById('var-apply');
        
        // Variable selection state
        let selectedVariables = [];
        let variableOrder = [];
        
        // Search dialog elements
        const searchDialog = document.getElementById('search-dialog');
        const searchDialogInput = document.getElementById('search-dialog-input');
        const searchDialogCount = document.getElementById('search-dialog-count');
        const searchPrevBtn = document.getElementById('search-prev');
        const searchNextBtn = document.getElementById('search-next');
        const searchCloseBtn = document.getElementById('search-close');
        
        // Search state
        let searchMatches = [];  // Array of {rowIndex, columnIndex}
        let currentMatchIndex = -1;
        
        // Jump dialog elements
        const jumpDialog = document.getElementById('jump-dialog');
        const jumpInput = document.getElementById('jump-input');

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
              // Check if this cell is in multi-selection or single selection
              const isMultiSelected = selectedCells.some(c => c.rowIndex === idx && c.columnIndex === colIdx);
              const isSingleSelected = selectedCell && selectedCell.rowIndex === idx && selectedCell.columnIndex === colIdx;
              const isSelected = isMultiSelected || isSingleSelected;
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
            td.addEventListener('click', function(e) {
              const rowIndex = parseInt(this.getAttribute('data-row'));
              const columnIndex = parseInt(this.getAttribute('data-col'));
              handleCellClick(rowIndex, columnIndex, e);
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
        function handleCellClick(rowIndex, columnIndex, event) {
          const rows = filteredRows || currentData.rows;
          const row = rows[rowIndex];
          const value = Array.isArray(row) ? row[columnIndex] : row[currentData.columns[columnIndex].name];
          const columnName = currentData.columns[columnIndex].name;
          
          const cellInfo = {
            rowIndex,
            columnIndex,
            value,
            columnName,
            columnType: currentData.columns[columnIndex].type
          };
          
          // Check for Ctrl+click (Windows) or Cmd+click (Mac) for multi-select
          const isMultiSelect = event && (event.ctrlKey || event.metaKey);
          
          if (isMultiSelect) {
            // Multi-select mode: only allow same column
            if (selectedCells.length > 0 && selectedCells[0].columnIndex !== columnIndex) {
              // Different column - start fresh with this cell
              selectedCells = [cellInfo];
              selectedCell = cellInfo;
            } else {
              // Same column or first selection
              // Check if already selected - if so, deselect
              const existingIdx = selectedCells.findIndex(c => c.rowIndex === rowIndex && c.columnIndex === columnIndex);
              if (existingIdx >= 0) {
                selectedCells.splice(existingIdx, 1);
                // Update selectedCell to last selected or null
                selectedCell = selectedCells.length > 0 ? selectedCells[selectedCells.length - 1] : null;
              } else {
                selectedCells.push(cellInfo);
                selectedCell = cellInfo;
              }
            }
          } else {
            // Normal click - single selection, clear multi-select
            selectedCells = [cellInfo];
            selectedCell = cellInfo;
          }
          
          renderTable(currentData);
          updateStatus();
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

        // Theme toggle
        themeToggleBtn.addEventListener('click', function() {
          isDarkTheme = !isDarkTheme;
          if (isDarkTheme) {
            document.body.classList.remove('light-theme');
            themeToggleBtn.textContent = '🌙';
            themeToggleBtn.title = 'Switch to Light Theme';
          } else {
            document.body.classList.add('light-theme');
            themeToggleBtn.textContent = '☀️';
            themeToggleBtn.title = 'Switch to Dark Theme';
          }
          // Save preference
          vscode.postMessage({ type: 'themeChanged', payload: { isDark: isDarkTheme } });
        });

        // Update status bar
        function updateStatus() {
          if (!currentData) return;
          const total = currentData.totalRows;
          const shown = filteredRows ? filteredRows.length : currentData.rows.length;
          let statusText = 'Rows: ' + shown + (filteredRows ? ' / ' + total : '') + ' | Columns: ' + currentData.totalColumns;
          
          // Show multi-select info
          if (selectedCells.length > 1) {
            statusText += ' | Selected: ' + selectedCells.length + ' values (Press I to filter)';
          }
          
          statusEl.textContent = statusText;
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', function(e) {
          // E key - Equal filter (requires selected cell)
          if ((e.key === 'e' || e.key === 'E') && selectedCell && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            const isShift = e.shiftKey;
            
            const newFilter = {
              columnName: selectedCell.columnName,
              operator: 'eq',
              value: selectedCell.value
            };
            
            if (!isShift) {
              // Replace all filters, reset to AND logic
              quickFilterState.filters = [newFilter];
              quickFilterState.logic = 'AND';
            } else {
              // Add to existing filters with AND logic
              quickFilterState.filters.push(newFilter);
              quickFilterState.logic = 'AND';
            }
            
            quickFilterState.enabled = true;
            applyQuickFiltersAndRender();
            return;
          }
          
          // I key - IN filter (requires multi-selected cells in same column)
          if ((e.key === 'i' || e.key === 'I') && selectedCells.length > 0 && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            
            // Get unique values from selected cells (all should be same column)
            const columnName = selectedCells[0].columnName;
            const uniqueValues = [...new Set(selectedCells.map(c => c.value))];
            
            if (uniqueValues.length === 1) {
              // Single value - just use equal filter
              quickFilterState.filters = [{
                columnName: columnName,
                operator: 'eq',
                value: uniqueValues[0]
              }];
            } else {
              // Multiple values - create OR filters for each value
              quickFilterState.filters = uniqueValues.map(val => ({
                columnName: columnName,
                operator: 'eq',
                value: val
              }));
              quickFilterState.logic = 'OR';
            }
            
            quickFilterState.enabled = true;
            applyQuickFiltersAndRender();
            return;
          }
          
          // Ctrl+F - Open search dialog
          if ((e.key === 'f' || e.key === 'F') && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            openSearchDialog();
            return;
          }
          
          // Ctrl+G - Open jump to row dialog
          if ((e.key === 'g' || e.key === 'G') && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            openJumpDialog();
            return;
          }
          
          // F key - Show frequency panel (requires selected cell) - always shows count/frequency table
          if ((e.key === 'f' || e.key === 'F') && selectedCell && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            showFrequencyPanel(selectedCell.columnName, selectedCell.columnIndex, 'frequency');
            return;
          }
          
          // M key - Show means/statistics panel for numeric columns (requires selected cell)
          if ((e.key === 'm' || e.key === 'M') && selectedCell && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            showFrequencyPanel(selectedCell.columnName, selectedCell.columnIndex, 'means');
            return;
          }
          
          // Esc key - Clear filters and selection, close panels
          if (e.key === 'Escape') {
            // Close jump dialog if open
            if (!jumpDialog.classList.contains('hidden')) {
              jumpDialog.classList.add('hidden');
              return;
            }
            // Close search dialog if open
            if (!searchDialog.classList.contains('hidden')) {
              closeSearchDialog();
              return;
            }
            // Close frequency panel if open
            if (!freqPanelWrapper.classList.contains('hidden')) {
              freqPanelWrapper.classList.add('hidden');
              return;
            }
            // Close variable selector if open
            if (!varModal.classList.contains('hidden')) {
              varModal.classList.add('hidden');
              return;
            }
            // Clear filters and selection
            quickFilterState = { enabled: false, filters: [], logic: 'AND' };
            selectedCell = null;
            selectedCells = [];
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

        // ===============================
        // Frequency Panel Functions
        // ===============================
        // mode: 'frequency' for count table (F key), 'means' for statistics (M key)
        function showFrequencyPanel(columnName, columnIndex, mode) {
          const column = currentData.columns[columnIndex];
          const rows = filteredRows || currentData.rows;
          const isNumeric = column.type === 'numeric' || column.type === 'integer';
          
          // Extract column values
          const values = rows.map(row => Array.isArray(row) ? row[columnIndex] : row[columnName]);
          
          if (mode === 'means') {
            // M key: Show statistics (only for numeric columns)
            if (!isNumeric) {
              freqTitle.textContent = 'Statistics: ' + columnName;
              freqContent.innerHTML = '<div class="numeric-stats"><p style="color: var(--text-muted);">Statistics are only available for numeric columns.<br>Press <strong>F</strong> to view frequency counts instead.</p></div>';
            } else {
              freqTitle.textContent = 'Statistics: ' + columnName + ' (proc means)';
              freqContent.innerHTML = renderNumericStats(values, columnName);
            }
          } else {
            // F key: Always show frequency table (like R count())
            freqTitle.textContent = 'Frequency: ' + columnName + ' (count)';
            freqContent.innerHTML = renderFrequencyTable(values, columnName);
            
            // Add click handlers to frequency rows for filtering
            const freqRows = freqContent.querySelectorAll('tr[data-value]');
            freqRows.forEach(row => {
              row.addEventListener('click', function() {
                const value = this.getAttribute('data-value');
                // Add filter for this value
                quickFilterState.filters = [{
                  columnName: columnName,
                  operator: 'eq',
                  value: value === 'NA' ? null : value
                }];
                quickFilterState.enabled = true;
                applyQuickFiltersAndRender();
              });
            });
          }
          
          freqPanelWrapper.classList.remove('hidden');
        }
        
        function renderNumericStats(values, columnName) {
          const validValues = values.filter(v => v !== null && v !== undefined && !isNaN(v));
          const n = validValues.length;
          const missing = values.length - n;
          
          if (n === 0) {
            return '<div class="numeric-stats"><p>No valid numeric values</p></div>';
          }
          
          const sorted = [...validValues].sort((a, b) => a - b);
          const sum = validValues.reduce((a, b) => a + b, 0);
          const mean = sum / n;
          const min = sorted[0];
          const max = sorted[n - 1];
          const median = n % 2 === 0 ? (sorted[n/2 - 1] + sorted[n/2]) / 2 : sorted[Math.floor(n/2)];
          const q1 = sorted[Math.floor(n * 0.25)];
          const q3 = sorted[Math.floor(n * 0.75)];
          
          // Standard deviation
          const variance = validValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (n - 1);
          const std = Math.sqrt(variance);
          
          return '<div class="numeric-stats">' +
            '<div class="stat-row"><span class="stat-label">N</span><span class="stat-value">' + n + '</span></div>' +
            '<div class="stat-row"><span class="stat-label">Missing</span><span class="stat-value">' + missing + '</span></div>' +
            '<div class="stat-row"><span class="stat-label">Mean</span><span class="stat-value">' + mean.toFixed(4) + '</span></div>' +
            '<div class="stat-row"><span class="stat-label">Std Dev</span><span class="stat-value">' + std.toFixed(4) + '</span></div>' +
            '<div class="stat-row"><span class="stat-label">Min</span><span class="stat-value">' + min + '</span></div>' +
            '<div class="stat-row"><span class="stat-label">Q1 (25%)</span><span class="stat-value">' + q1 + '</span></div>' +
            '<div class="stat-row"><span class="stat-label">Median</span><span class="stat-value">' + median.toFixed(4) + '</span></div>' +
            '<div class="stat-row"><span class="stat-label">Q3 (75%)</span><span class="stat-value">' + q3 + '</span></div>' +
            '<div class="stat-row"><span class="stat-label">Max</span><span class="stat-value">' + max + '</span></div>' +
            '</div>';
        }
        
        function renderFrequencyTable(values, columnName) {
          // Count frequencies
          const counts = {};
          values.forEach(v => {
            const key = v === null || v === undefined ? 'NA' : String(v);
            counts[key] = (counts[key] || 0) + 1;
          });
          
          // Sort by count descending
          const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
          const total = values.length;
          
          let html = '<table class="freq-table"><thead><tr>' +
            '<th>Value</th><th>Count</th><th>%</th>' +
            '</tr></thead><tbody>';
          
          sorted.forEach(([value, count]) => {
            const percent = ((count / total) * 100).toFixed(1);
            html += '<tr data-value="' + escapeHtml(value) + '">' +
              '<td class="freq-value">' + escapeHtml(value) + '</td>' +
              '<td class="freq-count">' + count + '</td>' +
              '<td class="freq-percent">' + percent + '%</td>' +
              '</tr>';
          });
          
          html += '</tbody></table>';
          return html;
        }
        
        // Close frequency panel
        freqCloseBtn.addEventListener('click', function() {
          freqPanelWrapper.classList.add('hidden');
        });

        // Frequency panel resizer drag functionality
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;
        
        freqResizer.addEventListener('mousedown', function(e) {
          isResizing = true;
          startX = e.clientX;
          startWidth = freqPanel.offsetWidth;
          freqResizer.classList.add('dragging');
          document.body.style.cursor = 'col-resize';
          document.body.style.userSelect = 'none';
          e.preventDefault();
        });
        
        document.addEventListener('mousemove', function(e) {
          if (!isResizing) return;
          
          // Calculate new width (dragging left increases width)
          const deltaX = startX - e.clientX;
          let newWidth = startWidth + deltaX;
          
          // Clamp to min/max
          newWidth = Math.max(180, Math.min(600, newWidth));
          freqPanel.style.width = newWidth + 'px';
        });
        
        document.addEventListener('mouseup', function() {
          if (isResizing) {
            isResizing = false;
            freqResizer.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
          }
        });

        // ===============================
        // Variable Selector Functions
        // ===============================
        function openVariableSelector() {
          if (!currentData) return;
          
          // Initialize selected variables if not set
          if (selectedVariables.length === 0) {
            selectedVariables = currentData.columns.map(c => c.name);
            variableOrder = [...selectedVariables];
          }
          
          renderVariableList();
          varModal.classList.remove('hidden');
        }
        
        function renderVariableList(searchQuery) {
          const query = (searchQuery || '').toLowerCase();
          
          let html = '';
          variableOrder.forEach((varName, idx) => {
            const col = currentData.columns.find(c => c.name === varName);
            if (!col) return;
            
            // Filter by search query
            if (query && !varName.toLowerCase().includes(query)) return;
            
            const isSelected = selectedVariables.includes(varName);
            const typeIcon = col.type === 'numeric' || col.type === 'integer' ? '#' : 
                           col.type === 'factor' ? '◆' : 'A';
            
            html += '<div class="var-item' + (isSelected ? ' selected' : '') + '" data-var="' + escapeHtml(varName) + '" data-idx="' + idx + '">' +
              '<span class="var-drag-handle">⋮⋮</span>' +
              '<input type="checkbox" ' + (isSelected ? 'checked' : '') + '>' +
              '<span class="var-name">' + escapeHtml(varName) + '</span>' +
              '<span class="var-type">' + typeIcon + ' ' + col.type + '</span>' +
              '</div>';
          });
          
          varList.innerHTML = html;
          
          // Add event handlers
          const items = varList.querySelectorAll('.var-item');
          items.forEach(item => {
            const checkbox = item.querySelector('input[type="checkbox"]');
            const varName = item.getAttribute('data-var');
            
            checkbox.addEventListener('change', function() {
              if (this.checked) {
                if (!selectedVariables.includes(varName)) {
                  selectedVariables.push(varName);
                }
                item.classList.add('selected');
              } else {
                selectedVariables = selectedVariables.filter(v => v !== varName);
                item.classList.remove('selected');
              }
            });
            
            // Drag and drop for reordering
            item.setAttribute('draggable', 'true');
            item.addEventListener('dragstart', function(e) {
              e.dataTransfer.setData('text/plain', item.getAttribute('data-idx'));
              item.style.opacity = '0.5';
            });
            item.addEventListener('dragend', function() {
              item.style.opacity = '1';
            });
            item.addEventListener('dragover', function(e) {
              e.preventDefault();
              item.style.borderTop = '2px solid var(--accent)';
            });
            item.addEventListener('dragleave', function() {
              item.style.borderTop = '';
            });
            item.addEventListener('drop', function(e) {
              e.preventDefault();
              item.style.borderTop = '';
              const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
              const toIdx = parseInt(item.getAttribute('data-idx'));
              
              if (fromIdx !== toIdx) {
                const movedVar = variableOrder.splice(fromIdx, 1)[0];
                variableOrder.splice(toIdx, 0, movedVar);
                renderVariableList(varSearch.value);
              }
            });
          });
        }
        
        // Variable selector event handlers
        selectVarsBtn.addEventListener('click', openVariableSelector);
        
        varModalCloseBtn.addEventListener('click', function() {
          varModal.classList.add('hidden');
        });
        
        varSearch.addEventListener('input', function() {
          renderVariableList(this.value);
        });
        
        varSelectAllBtn.addEventListener('click', function() {
          selectedVariables = [...variableOrder];
          renderVariableList(varSearch.value);
        });
        
        varSelectNoneBtn.addEventListener('click', function() {
          selectedVariables = [];
          renderVariableList(varSearch.value);
        });
        
        varCancelBtn.addEventListener('click', function() {
          varModal.classList.add('hidden');
        });
        
        // ===============================
        // Search Dialog Functions
        // ===============================
        function openSearchDialog() {
          searchDialog.classList.remove('hidden');
          searchDialogInput.focus();
          searchDialogInput.select();
        }
        
        function closeSearchDialog() {
          searchDialog.classList.add('hidden');
          clearSearchHighlights();
          searchMatches = [];
          currentMatchIndex = -1;
        }
        
        function performSearch(query) {
          clearSearchHighlights();
          searchMatches = [];
          currentMatchIndex = -1;
          
          if (!query || !currentData) {
            searchDialogCount.textContent = '0 matches';
            return;
          }
          
          const rows = filteredRows || currentData.rows;
          const lowerQuery = query.toLowerCase();
          
          rows.forEach((row, rowIdx) => {
            currentData.columns.forEach((col, colIdx) => {
              const value = Array.isArray(row) ? row[colIdx] : row[col.name];
              if (value !== null && value !== undefined) {
                if (String(value).toLowerCase().includes(lowerQuery)) {
                  searchMatches.push({ rowIndex: rowIdx, columnIndex: colIdx });
                }
              }
            });
          });
          
          searchDialogCount.textContent = searchMatches.length + ' match' + (searchMatches.length !== 1 ? 'es' : '');
          
          if (searchMatches.length > 0) {
            currentMatchIndex = 0;
            highlightMatches();
            goToMatch(0);
          }
        }
        
        function highlightMatches() {
          searchMatches.forEach((match, idx) => {
            const cell = mainEl.querySelector('td[data-row="' + match.rowIndex + '"][data-col="' + match.columnIndex + '"]');
            if (cell) {
              cell.classList.add('search-match');
              if (idx === currentMatchIndex) {
                cell.classList.add('search-current');
              }
            }
          });
        }
        
        function clearSearchHighlights() {
          const highlighted = mainEl.querySelectorAll('.search-match, .search-current');
          highlighted.forEach(el => {
            el.classList.remove('search-match', 'search-current');
          });
        }
        
        function goToMatch(index) {
          if (searchMatches.length === 0) return;
          
          // Clear previous current highlight
          const prevCurrent = mainEl.querySelector('.search-current');
          if (prevCurrent) prevCurrent.classList.remove('search-current');
          
          currentMatchIndex = index;
          if (currentMatchIndex < 0) currentMatchIndex = searchMatches.length - 1;
          if (currentMatchIndex >= searchMatches.length) currentMatchIndex = 0;
          
          const match = searchMatches[currentMatchIndex];
          const cell = mainEl.querySelector('td[data-row="' + match.rowIndex + '"][data-col="' + match.columnIndex + '"]');
          if (cell) {
            cell.classList.add('search-current');
            cell.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
          }
          
          searchDialogCount.textContent = (currentMatchIndex + 1) + ' of ' + searchMatches.length;
        }
        
        // Search dialog event handlers
        searchDialogInput.addEventListener('input', function() {
          performSearch(this.value);
        });
        
        searchDialogInput.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
              goToMatch(currentMatchIndex - 1);
            } else {
              goToMatch(currentMatchIndex + 1);
            }
          }
          if (e.key === 'Escape') {
            closeSearchDialog();
          }
        });
        
        searchPrevBtn.addEventListener('click', function() {
          goToMatch(currentMatchIndex - 1);
        });
        
        searchNextBtn.addEventListener('click', function() {
          goToMatch(currentMatchIndex + 1);
        });
        
        searchCloseBtn.addEventListener('click', closeSearchDialog);

        // ===============================
        // Jump to Row Functions
        // ===============================
        function openJumpDialog() {
          if (!currentData) return;
          const rows = filteredRows || currentData.rows;
          jumpInput.setAttribute('max', rows.length);
          jumpInput.setAttribute('min', '1');
          jumpInput.value = '';
          jumpDialog.classList.remove('hidden');
          jumpInput.focus();
        }
        
        jumpInput.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            const rowNum = parseInt(this.value);
            const rows = filteredRows || currentData.rows;
            
            if (isNaN(rowNum) || rowNum < 1 || rowNum > rows.length) {
              this.style.borderColor = '#f44336';
              return;
            }
            
            this.style.borderColor = '';
            jumpDialog.classList.add('hidden');
            
            // Select first cell of that row
            const rowIndex = rowNum - 1;
            const colIndex = selectedCell ? selectedCell.columnIndex : 0;
            handleCellClick(rowIndex, colIndex);
            scrollToCell(rowIndex, colIndex);
          }
          if (e.key === 'Escape') {
            jumpDialog.classList.add('hidden');
          }
        });

        varApplyBtn.addEventListener('click', function() {
          if (selectedVariables.length === 0) {
            alert('Please select at least one variable');
            return;
          }
          
          // Reorder columns based on selection
          const newColumns = [];
          const newRows = currentData.rows.map(row => {
            const newRow = [];
            variableOrder.forEach(varName => {
              if (selectedVariables.includes(varName)) {
                const colIdx = currentData.columns.findIndex(c => c.name === varName);
                if (colIdx !== -1) {
                  if (newColumns.length < selectedVariables.length) {
                    newColumns.push({ ...currentData.columns[colIdx], index: newColumns.length });
                  }
                  newRow.push(Array.isArray(row) ? row[colIdx] : row[varName]);
                }
              }
            });
            return newRow;
          });
          
          // Update current data
          currentData = {
            ...currentData,
            columns: newColumns,
            rows: newRows,
            totalColumns: newColumns.length
          };
          
          // Reset states
          filteredRows = null;
          sortState = { columns: [] };
          quickFilterState = { enabled: false, filters: [], logic: 'AND' };
          selectedCell = null;
          selectedCells = [];
          
          // Re-render
          renderFilterChips();
          renderTable(currentData);
          updateStatus();
          
          varModal.classList.add('hidden');
        });

        // Handle messages from extension
        window.addEventListener('message', function(event) {
          const message = event.data;
          console.log('[Webview] Received message:', message.type);
          switch (message.type) {
            case 'setData':
              console.log('[Webview] setData payload:', JSON.stringify(message.payload, null, 2).substring(0, 500));
              console.log('[Webview] columns:', message.payload.columns);
              console.log('[Webview] rows sample:', message.payload.rows ? message.payload.rows.slice(0, 2) : 'no rows');
              currentData = message.payload;
              filteredRows = null;
              sortState = { columns: [] };  // Reset sort on new data
              quickFilterState = { enabled: false, filters: [], logic: 'AND' };
              selectedCell = null;
              selectedCells = [];
              // Initialize variable selection
              selectedVariables = currentData.columns.map(c => c.name);
              variableOrder = [...selectedVariables];
              titleEl.textContent = '📊 ' + currentData.name;
              renderFilterChips();
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

