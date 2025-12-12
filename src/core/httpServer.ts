/**
 * HTTP Server for R Communication
 * Allows R to send data to the extension via REView() function
 */

import * as http from 'http';
import * as vscode from 'vscode';
import { IDataFrame, IColumnDef, RDataType } from './types';
import { eventBus } from './eventBus';

/**
 * Data received from R's REView() function
 */
interface RViewData {
  name: string;
  data: Record<string, unknown[]>;
  nrow: number;
  ncol: number;
  colnames: string[];
  coltypes: string[] | Record<string, string>;
  labels?: Record<string, string>;
}

/**
 * REViewer HTTP Server
 * Listens for data from R and opens viewer panels
 */
export class REViewerServer {
  private server: http.Server | null = null;
  private port: number;
  private extensionUri: vscode.Uri;
  private onDataReceived: ((data: IDataFrame) => void) | null = null;

  constructor(extensionUri: vscode.Uri, port?: number) {
    this.extensionUri = extensionUri;
    this.port = port ?? vscode.workspace.getConfiguration('reviewer').get<number>('server.port', 8765);
  }

  /**
   * Set callback for when data is received
   */
  setOnDataReceived(callback: (data: IDataFrame) => void): void {
    this.onDataReceived = callback;
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    if (this.server) {
      console.log('REViewer server already running');
      return;
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          // Try alternative port
          const altPort = this.port + 1;
          console.log(`Port ${this.port} in use, trying ${altPort}`);
          this.port = altPort;
          this.server?.listen(this.port, 'localhost');
        } else {
          console.error('Server error:', error);
          reject(error);
        }
      });

      this.server.listen(this.port, 'localhost', () => {
        console.log(`✓ REViewer HTTP server listening on http://localhost:${this.port}`);
        vscode.window.setStatusBarMessage(`REViewer: listening on port ${this.port}`, 5000);
        resolve();
      });
    });
  }

  /**
   * Get the current port
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Handle incoming HTTP requests
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Set CORS headers for localhost
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle OPTIONS (CORS preflight)
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Health check endpoint
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', port: this.port }));
      return;
    }

    // Main endpoint: POST /review
    if (req.method === 'POST' && req.url === '/review') {
      this.handleReviewRequest(req, res);
      return;
    }

    // 404 for other routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  /**
   * Handle POST /review request
   */
  private handleReviewRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';
    let bodySize = 0;
    const maxBodySize = 100 * 1024 * 1024; // 100MB limit

    req.on('data', (chunk: Buffer) => {
      bodySize += chunk.length;
      if (bodySize > maxBodySize) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'error', 
          message: 'Data too large. Maximum size is 100MB.' 
        }));
        req.destroy();
        return;
      }
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const startTime = Date.now();
        const rData = JSON.parse(body) as RViewData;

        // Validate data structure
        if (!rData.name || !rData.data) {
          throw new Error('Invalid data format: missing name or data');
        }

        // Convert to IDataFrame format
        const dataFrame = this.convertToDataFrame(rData);
        const parseTime = Date.now() - startTime;

        console.log(`✓ Received "${dataFrame.name}": ${dataFrame.totalRows} rows × ${dataFrame.totalColumns} cols (parsed in ${parseTime}ms)`);

        // Emit event for the extension to handle
        eventBus.emit('data:loaded', { data: dataFrame });

        // Call the callback if set
        if (this.onDataReceived) {
          this.onDataReceived(dataFrame);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'success',
          message: `Viewing ${dataFrame.name}`,
          rows: dataFrame.totalRows,
          columns: dataFrame.totalColumns,
          parseTime: parseTime
        }));

      } catch (error) {
        console.error('Error processing request:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'error', 
          message: (error as Error).message 
        }));
      }
    });

    req.on('error', (error) => {
      console.error('Request error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', message: 'Server error' }));
    });
  }

  /**
   * Convert R data to IDataFrame format
   */
  private convertToDataFrame(rData: RViewData): IDataFrame {
    const columns: IColumnDef[] = [];
    const rows: (string | number | boolean | null)[][] = [];

    // Build column definitions
    rData.colnames.forEach((colName, index) => {
      // Get column type (handle both array and object formats)
      let rType: string;
      if (Array.isArray(rData.coltypes)) {
        rType = rData.coltypes[index] || 'unknown';
      } else {
        rType = rData.coltypes[colName] || 'unknown';
      }

      // Get label if available
      const label = rData.labels?.[colName];

      // Check if column has NA values
      const colData = rData.data[colName] || [];
      const hasNA = colData.some(v => v === null || v === 'NA');

      columns.push({
        name: colName,
        type: this.mapRType(rType),
        label: label,
        index: index,
        hasNA: hasNA,
      });
    });

    // Convert column-based data to row-based
    for (let i = 0; i < rData.nrow; i++) {
      const row: (string | number | boolean | null)[] = [];
      rData.colnames.forEach((colName) => {
        const colData = rData.data[colName];
        if (colData && i < colData.length) {
          const value = colData[i];
          // Handle R's NA values
          if (value === null || value === 'NA') {
            row.push(null);
          } else {
            row.push(value as string | number | boolean);
          }
        } else {
          row.push(null);
        }
      });
      rows.push(row);
    }

    return {
      name: rData.name,
      columns: columns,
      rows: rows,
      totalRows: rData.nrow,
      totalColumns: rData.ncol,
      hasMore: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Map R data types to our RDataType
   */
  private mapRType(rType: string): RDataType {
    // Handle R's compound types like "c('POSIXct', 'POSIXt')"
    const normalizedType = rType.toLowerCase().replace(/['"]/g, '');
    
    const typeMap: Record<string, RDataType> = {
      'numeric': 'numeric',
      'double': 'numeric',
      'integer': 'integer',
      'character': 'character',
      'factor': 'factor',
      'logical': 'logical',
      'date': 'Date',
      'posixct': 'POSIXct',
      'posixt': 'POSIXct',
      'posixlt': 'POSIXlt',
      'complex': 'complex',
      'raw': 'raw',
      'list': 'list',
    };

    // Check if any known type is in the string
    for (const [key, value] of Object.entries(typeMap)) {
      if (normalizedType.includes(key)) {
        return value;
      }
    }

    return 'unknown';
  }

  /**
   * Stop the HTTP server
   */
  stop(): void {
    if (this.server) {
      this.server.close(() => {
        console.log('REViewer server stopped');
      });
      this.server = null;
    }
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server !== null;
  }
}

// Singleton instance (will be initialized in extension.ts)
let serverInstance: REViewerServer | null = null;

export function getServerInstance(): REViewerServer | null {
  return serverInstance;
}

export function setServerInstance(server: REViewerServer): void {
  serverInstance = server;
}

