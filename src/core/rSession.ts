/**
 * R Session Management
 * Handles communication with R process via HTTP server
 */

import * as vscode from 'vscode';
import { IDataFrame, IDataFrameMetadata } from './types';
import { getServerInstance } from './httpServer';

/**
 * R Session configuration
 */
interface IRSessionConfig {
  timeout: number;
}

/**
 * RSession class for managing R process communication
 * 
 * This implementation uses HTTP to communicate with R via the REViewer server.
 * R needs to run reviewer_connect() to enable bidirectional communication.
 */
class RSession {
  private config: IRSessionConfig;

  constructor() {
    this.config = this.loadConfig();

    // Watch for configuration changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('reviewer.r')) {
        this.config = this.loadConfig();
      }
    });
  }

  /**
   * Load configuration from VS Code settings
   */
  private loadConfig(): IRSessionConfig {
    const config = vscode.workspace.getConfiguration('reviewer.r');
    return {
      timeout: config.get<number>('timeout', 30000),
    };
  }

  /**
   * Check if R session is connected
   */
  isConnected(): boolean {
    const server = getServerInstance();
    return server?.isRSessionConnected() ?? false;
  }

  /**
   * Get list of data frames in R environment
   * @returns Array of data frame metadata
   */
  async listDataFrames(): Promise<IDataFrameMetadata[]> {
    const server = getServerInstance();
    
    if (!server) {
      throw new Error('REViewer server not running');
    }

    if (!server.isRSessionConnected()) {
      throw new Error('R session not connected. Run reviewer_connect() in R.');
    }

    try {
      const result = await server.requestDataFramesList();
      return result;
    } catch (error) {
      console.error('Failed to list data frames:', error);
      throw error;
    }
  }

  /**
   * Get data from a data frame
   * @param name - Name of the data frame
   * @param offset - Starting row (0-indexed) - not yet supported via HTTP
   * @param limit - Number of rows to fetch - not yet supported via HTTP
   * @param columns - Specific columns to fetch - not yet supported via HTTP
   * @returns Data frame data
   */
  async getData(
    name: string,
    offset = 0,
    limit = 10000,
    columns?: string[]
  ): Promise<IDataFrame> {
    const server = getServerInstance();
    
    if (!server) {
      throw new Error('REViewer server not running');
    }

    if (!server.isRSessionConnected()) {
      throw new Error('R session not connected. Run reviewer_connect() in R.');
    }

    try {
      // Note: offset, limit, columns filtering not yet implemented in HTTP mode
      // For now, we fetch the entire data frame
      const result = await server.requestDataFrame(name);
      return result;
    } catch (error) {
      console.error(`Failed to get data frame "${name}":`, error);
      throw error;
    }
  }

  /**
   * Get column statistics
   * @param dataFrameName - Name of the data frame
   * @param columnName - Name of the column
   * @returns Column statistics
   */
  async getColumnStats(dataFrameName: string, columnName: string): Promise<unknown> {
    // Not yet implemented via HTTP - would need additional endpoint
    throw new Error('Column statistics not yet supported in HTTP mode');
  }

  /**
   * Apply filter to data frame and get results
   * @param dataFrameName - Name of the data frame
   * @param filterExpression - R filter expression (dplyr-style)
   * @param offset - Starting row
   * @param limit - Number of rows
   * @returns Filtered data
   */
  async getFilteredData(
    dataFrameName: string,
    filterExpression: string,
    offset = 0,
    limit = 10000
  ): Promise<IDataFrame> {
    // Not yet implemented via HTTP - would need additional endpoint
    throw new Error('Server-side filtering not yet supported in HTTP mode');
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    // Nothing to dispose in HTTP mode
  }
}

// Export singleton instance
export const rSession = new RSession();

// Also export class for testing
export { RSession };
