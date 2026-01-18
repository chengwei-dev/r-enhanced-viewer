/**
 * vscode-r Extension API Integration
 * Provides seamless connection to R session through the vscode-r extension
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { IDataFrame, IDataFrameMetadata } from './types';
import { getServerInstance } from './httpServer';

// vscode-r extension ID (REditorSupport.r is the current maintained version)
const VSCODE_R_EXTENSION_ID = 'REditorSupport.r';
// Fallback for older extension ID
const VSCODE_R_EXTENSION_ID_OLD = 'Ikuyadeu.r';

/**
 * Interface for vscode-r extension API
 * Based on: https://github.com/REditorSupport/vscode-R/wiki/Extension-API
 */
interface VscodeRApi {
  // Run text in R terminal (no return value)
  runTextInTerm?: (text: string) => void;
  // Run R command with return value (if available)
  runCommandWithRet?: (command: string) => Promise<string>;
  // Check if R session is active
  isRSessionActive?: () => boolean;
  // Get R terminal
  getRTerm?: () => vscode.Terminal | undefined;
}

/**
 * VscodeRConnection class for managing connection via vscode-r extension
 */
class VscodeRConnection {
  private rExtension: vscode.Extension<VscodeRApi> | undefined;
  private rApi: VscodeRApi | undefined;
  private isInitialized = false;
  private initializationPromise: Promise<boolean> | null = null;
  private pendingRequests: Map<string, {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  /**
   * Check if vscode-r extension is available
   */
  isAvailable(): boolean {
    return this.rExtension !== undefined;
  }

  /**
   * Initialize connection to vscode-r extension
   */
  async initialize(): Promise<boolean> {
    // If already initializing, return the existing promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._doInitialize();
    return this.initializationPromise;
  }

  private async _doInitialize(): Promise<boolean> {
    // Try to get the vscode-r extension
    this.rExtension = vscode.extensions.getExtension<VscodeRApi>(VSCODE_R_EXTENSION_ID);
    
    // Try fallback ID if primary not found
    if (!this.rExtension) {
      this.rExtension = vscode.extensions.getExtension<VscodeRApi>(VSCODE_R_EXTENSION_ID_OLD);
    }

    if (!this.rExtension) {
      console.log('vscode-r extension not found');
      return false;
    }

    // Activate the extension if not active
    if (!this.rExtension.isActive) {
      try {
        await this.rExtension.activate();
      } catch (error) {
        console.error('Failed to activate vscode-r extension:', error);
        return false;
      }
    }

    this.rApi = this.rExtension.exports;
    this.isInitialized = true;
    
    console.log('✓ vscode-r extension connected');
    return true;
  }

  /**
   * Check if R session is ready
   */
  async isRSessionReady(): Promise<boolean> {
    if (!this.isInitialized || !this.rApi) {
      return false;
    }

    // Check if there's an active R terminal
    const rTerminal = this.findRTerminal();
    return rTerminal !== undefined;
  }

  /**
   * Find the R terminal
   */
  private findRTerminal(): vscode.Terminal | undefined {
    // Try using the API first
    if (this.rApi?.getRTerm) {
      return this.rApi.getRTerm();
    }

    // Fall back to searching terminals by name
    return vscode.window.terminals.find(t => 
      t.name.toLowerCase().includes('r') || 
      t.name === 'R Interactive' ||
      t.name === 'R' ||
      t.name.startsWith('R:')
    );
  }

  /**
   * Run R code in terminal (fire and forget)
   */
  async runInTerminal(code: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('vscode-r connection not initialized');
    }

    // Use vscode-r API if available
    if (this.rApi?.runTextInTerm) {
      this.rApi.runTextInTerm(code);
      return;
    }

    // Fall back to sending text to terminal directly
    const terminal = this.findRTerminal();
    if (!terminal) {
      throw new Error('No R terminal found. Please start an R session first.');
    }

    terminal.sendText(code);
  }

  /**
   * Get R code to initialize REViewer functions in R
   * This code will be automatically injected into R session
   */
  getInitializationCode(port: number): string {
    return `
# REViewer initialization (auto-injected)
if (!exists(".REViewer_initialized", envir = .GlobalEnv)) {
  .REViewer_port <<- ${port}
  
  # REView function to send data to VS Code
  REView <<- function(x, name = NULL) {
    if (!requireNamespace("jsonlite", quietly = TRUE)) {
      message("Installing jsonlite...")
      install.packages("jsonlite", quiet = TRUE)
    }
    if (!requireNamespace("httr", quietly = TRUE)) {
      message("Installing httr...")
      install.packages("httr", quiet = TRUE)
    }
    
    var_name <- if (!is.null(name)) name else deparse(substitute(x))
    if (!is.data.frame(x)) x <- as.data.frame(x)
    
    # Get column types
    col_types <- sapply(x, function(col) {
      cls <- class(col)[1]
      if (cls %in% c("numeric", "integer")) "numeric"
      else if (cls %in% c("factor", "character")) "character"
      else if (cls %in% c("Date", "POSIXct", "POSIXlt")) "date"
      else if (cls == "logical") "logical"
      else "character"
    })
    
    json_data <- jsonlite::toJSON(list(
      name = var_name,
      data = as.list(x),
      nrow = nrow(x),
      ncol = ncol(x),
      colnames = colnames(x),
      coltypes = col_types
    ), auto_unbox = TRUE, null = "null", na = "null")
    
    tryCatch({
      httr::POST(
        paste0("http://localhost:", .REViewer_port, "/review"),
        body = json_data,
        encode = "raw",
        httr::content_type_json(),
        httr::timeout(5)
      )
      message("\\u2713 REViewer: ", var_name, " (", nrow(x), " \\u00d7 ", ncol(x), ")")
    }, error = function(e) {
      message("\\u2717 REViewer not available: ", e$message)
    })
    invisible(x)
  }
  
  .REViewer_initialized <<- TRUE
  message("\\u2713 REViewer ready. Use REView(df) to view data frames.")
}
`;
  }

  /**
   * Initialize R session with REViewer functions
   * Writes code to a temp file and sources it to avoid terminal buffer issues
   */
  async initializeRSession(port: number): Promise<void> {
    const code = this.getInitializationCode(port);
    
    // Use a short, clean temp file path
    // On macOS/Linux: /tmp/reviewer_init.R
    // On Windows: use os.tmpdir()
    const isWindows = process.platform === 'win32';
    const tempFile = isWindows 
      ? path.join(os.tmpdir(), 'reviewer_init.R')
      : '/tmp/reviewer_init.R';
    
    fs.writeFileSync(tempFile, code, 'utf8');
    
    // Source the temp file - simple and clear for users
    const sourcePath = tempFile.replace(/\\/g, '/');
    await this.runInTerminal(`source("${sourcePath}")`);
  }

  /**
   * Write R code to temp file and return file path
   */
  private writeCodeToTempFile(code: string, prefix: string): string {
    const isWindows = process.platform === 'win32';
    const tempDir = isWindows ? os.tmpdir() : '/tmp';
    
    const tempFile = path.join(tempDir, `reviewer_${prefix}.R`);
    fs.writeFileSync(tempFile, code, 'utf8');
    
    // Use forward slashes for R compatibility on all platforms
    return tempFile.replace(/\\/g, '/');
  }

  /**
   * List data frames in R environment
   * Uses HTTP callback to receive the result
   */
  async listDataFrames(): Promise<IDataFrameMetadata[]> {
    const server = getServerInstance();
    if (!server) {
      throw new Error('REViewer server not running');
    }

    const requestId = `list_${Date.now()}`;
    const port = server.getPort();
    
    // Create a promise that will be resolved when we receive the HTTP callback
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Timeout waiting for R response'));
      }, 10000);

      this.pendingRequests.set(requestId, { resolve: resolve as (value: unknown) => void, reject, timeout });

      // Run R code that will POST the result back to our server
      const code = `local({
  result <- .REViewer_listDataFrames()
  httr::POST(
    "http://localhost:${port}/callback/${requestId}",
    body = result,
    encode = "raw",
    httr::content_type_json(),
    httr::timeout(5)
  )
})`;
      
      const tempFile = this.writeCodeToTempFile(code, 'list');
      this.runInTerminal(`source("${tempFile}")`).catch(reject);
    });
  }

  /**
   * Get data frame from R environment
   * Uses HTTP callback to receive the result
   */
  async getDataFrame(name: string): Promise<IDataFrame> {
    const server = getServerInstance();
    if (!server) {
      throw new Error('REViewer server not running');
    }

    const requestId = `get_${name}_${Date.now()}`;
    const port = server.getPort();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Timeout waiting for R response'));
      }, 30000); // Longer timeout for data retrieval

      this.pendingRequests.set(requestId, { resolve: resolve as (value: unknown) => void, reject, timeout });

      // Run R code that will POST the result back to our server
      const code = `local({
  result <- .REViewer_getDataFrame("${name}")
  httr::POST(
    "http://localhost:${port}/callback/${requestId}",
    body = result,
    encode = "raw",
    httr::content_type_json(),
    httr::timeout(30)
  )
})`;
      
      const tempFile = this.writeCodeToTempFile(code, 'get');
      this.runInTerminal(`source("${tempFile}")`).catch(reject);
    });
  }

  /**
   * Handle callback response from R
   */
  handleCallback(requestId: string, data: unknown): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);
      pending.resolve(data);
    }
  }

  /**
   * Send data frame to viewer directly
   */
  async sendToViewer(name: string): Promise<void> {
    await this.runInTerminal(`REView(${name})`);
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    // Clear all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection disposed'));
    }
    this.pendingRequests.clear();
    this.isInitialized = false;
    this.rApi = undefined;
    
    // Clean up temp files
    try {
      const isWindows = process.platform === 'win32';
      const tempFile = isWindows 
        ? path.join(os.tmpdir(), 'reviewer_init.R')
        : '/tmp/reviewer_init.R';
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Export singleton instance
export const vscodeRConnection = new VscodeRConnection();

// Export class for testing
export { VscodeRConnection };

