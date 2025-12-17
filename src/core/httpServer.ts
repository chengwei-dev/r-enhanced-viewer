/**
 * HTTP Server for R Communication
 * Allows R to send data to the extension via REView() function
 * Also handles bidirectional communication for GUI-based data frame viewing
 */

import * as http from 'http';
import * as vscode from 'vscode';
import { IDataFrame, IColumnDef, RDataType, IDataFrameMetadata } from './types';
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
 * R Session registration info
 */
interface RSessionInfo {
  registeredAt: number;
  lastHeartbeat: number;
  rVersion?: string;
  pid?: number;
}

/**
 * Pending request from VS Code waiting for R response
 */
interface PendingRequest {
  id: string;
  type: 'listDataFrames' | 'getData';
  params?: Record<string, unknown>;
  createdAt: number;
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
}

/**
 * REViewer HTTP Server
 * Listens for data from R and opens viewer panels
 * Also handles bidirectional communication for command palette
 */
export class REViewerServer {
  private server: http.Server | null = null;
  private port: number;
  private extensionUri: vscode.Uri;
  private onDataReceived: ((data: IDataFrame) => void) | null = null;
  
  // R session tracking
  private rSession: RSessionInfo | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private requestCounter = 0;
  private requestTimeout = 30000; // 30 seconds
  
  // Callbacks for status changes
  private onRSessionConnected: (() => void) | null = null;
  private onRSessionDisconnected: (() => void) | null = null;

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
   * Set callback for R session connection status changes
   */
  setOnRSessionStatusChange(
    onConnected: () => void,
    onDisconnected: () => void
  ): void {
    this.onRSessionConnected = onConnected;
    this.onRSessionDisconnected = onDisconnected;
  }

  /**
   * Check if R session is connected
   */
  isRSessionConnected(): boolean {
    if (!this.rSession) return false;
    // Consider session disconnected if no heartbeat for 60 seconds
    const timeout = 60000;
    return Date.now() - this.rSession.lastHeartbeat < timeout;
  }

  /**
   * Request data frames list from R
   */
  async requestDataFramesList(): Promise<IDataFrameMetadata[]> {
    if (!this.isRSessionConnected()) {
      throw new Error('R session not connected. Run reviewer_connect() in R.');
    }

    return new Promise((resolve, reject) => {
      const id = `req_${++this.requestCounter}_${Date.now()}`;
      const request: PendingRequest = {
        id,
        type: 'listDataFrames',
        createdAt: Date.now(),
        resolve: resolve as (data: unknown) => void,
        reject,
      };

      this.pendingRequests.set(id, request);

      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, this.requestTimeout);
    });
  }

  /**
   * Request data frame data from R
   */
  async requestDataFrame(name: string): Promise<IDataFrame> {
    if (!this.isRSessionConnected()) {
      throw new Error('R session not connected. Run reviewer_connect() in R.');
    }

    return new Promise((resolve, reject) => {
      const id = `req_${++this.requestCounter}_${Date.now()}`;
      const request: PendingRequest = {
        id,
        type: 'getData',
        params: { name },
        createdAt: Date.now(),
        resolve: resolve as (data: unknown) => void,
        reject,
      };

      this.pendingRequests.set(id, request);

      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, this.requestTimeout);
    });
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

    const url = req.url || '';

    // Health check endpoint
    if (req.method === 'GET' && url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'ok', 
        port: this.port,
        rSessionConnected: this.isRSessionConnected()
      }));
      return;
    }

    // R session status endpoint
    if (req.method === 'GET' && url === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        connected: this.isRSessionConnected(),
        session: this.rSession ? {
          registeredAt: this.rSession.registeredAt,
          lastHeartbeat: this.rSession.lastHeartbeat,
          rVersion: this.rSession.rVersion,
        } : null,
        pendingRequests: this.pendingRequests.size,
      }));
      return;
    }

    // R session registration endpoint
    if (req.method === 'POST' && url === '/register') {
      this.handleRegisterRequest(req, res);
      return;
    }

    // R session heartbeat endpoint
    if (req.method === 'POST' && url === '/heartbeat') {
      this.handleHeartbeatRequest(req, res);
      return;
    }

    // R polls for pending requests
    if (req.method === 'GET' && url === '/pending') {
      this.handlePendingRequest(req, res);
      return;
    }

    // R responds to a request
    if (req.method === 'POST' && url.startsWith('/respond/')) {
      this.handleRespondRequest(req, res, url);
      return;
    }

    // Main endpoint: POST /review (R sends data directly)
    if (req.method === 'POST' && url === '/review') {
      this.handleReviewRequest(req, res);
      return;
    }

    // 404 for other routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  /**
   * Handle R session registration
   */
  private handleRegisterRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = body ? JSON.parse(body) : {};
        
        const wasConnected = this.isRSessionConnected();
        
        this.rSession = {
          registeredAt: Date.now(),
          lastHeartbeat: Date.now(),
          rVersion: data.rVersion,
          pid: data.pid,
        };

        console.log(`✓ R session registered (R ${data.rVersion || 'unknown'})`);
        
        if (!wasConnected && this.onRSessionConnected) {
          this.onRSessionConnected();
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'registered', port: this.port }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (error as Error).message }));
      }
    });
  }

  /**
   * Handle R session heartbeat
   */
  private handleHeartbeatRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (this.rSession) {
      this.rSession.lastHeartbeat = Date.now();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not registered' }));
    }
  }

  /**
   * Handle R polling for pending requests
   */
  private handlePendingRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Update heartbeat
    if (this.rSession) {
      this.rSession.lastHeartbeat = Date.now();
    }

    // Find oldest pending request
    let oldestRequest: PendingRequest | null = null;
    for (const request of this.pendingRequests.values()) {
      if (!oldestRequest || request.createdAt < oldestRequest.createdAt) {
        oldestRequest = request;
      }
    }

    if (oldestRequest) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: oldestRequest.id,
        type: oldestRequest.type,
        params: oldestRequest.params,
      }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: null }));
    }
  }

  /**
   * Handle R responding to a pending request
   */
  private handleRespondRequest(req: http.IncomingMessage, res: http.ServerResponse, url: string): void {
    const requestId = url.replace('/respond/', '');
    const pending = this.pendingRequests.get(requestId);

    if (!pending) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request not found or expired' }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const response = JSON.parse(body);
        
        this.pendingRequests.delete(requestId);

        if (response.error) {
          pending.reject(new Error(response.error));
        } else if (pending.type === 'listDataFrames') {
          pending.resolve(response.data as IDataFrameMetadata[]);
        } else if (pending.type === 'getData') {
          const dataFrame = this.convertToDataFrame(response.data as RViewData);
          pending.resolve(dataFrame);
        } else {
          pending.resolve(response.data);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } catch (error) {
        pending.reject(error as Error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (error as Error).message }));
      }
    });
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
        console.log('Data columns:', dataFrame.columns.map(c => c.name));
        console.log('First row:', dataFrame.rows[0]);

        // Emit event for the extension to handle
        eventBus.emit('data:loaded', { data: dataFrame });

        // Call the callback if set
        if (this.onDataReceived) {
          console.log('Calling onDataReceived callback...');
          this.onDataReceived(dataFrame);
          console.log('onDataReceived callback completed');
        } else {
          console.warn('Warning: onDataReceived callback is not set!');
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






