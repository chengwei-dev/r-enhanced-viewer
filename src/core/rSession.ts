/**
 * R Session Management
 * Handles communication with R process for data retrieval
 */

import * as vscode from 'vscode';
import { IRRequest, IRResponse, IDataFrame, IDataFrameMetadata } from './types';

/**
 * R Session configuration
 */
interface IRSessionConfig {
  timeout: number;
  maxRetries: number;
}

/**
 * RSession class for managing R process communication
 * 
 * This implementation uses the R extension's API when available,
 * or falls back to terminal-based execution
 */
class RSession {
  private config: IRSessionConfig;
  private requestCounter = 0;
  private pendingRequests: Map<string, {
    resolve: (response: IRResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  constructor() {
    this.config = this.loadConfig();

    // Watch for configuration changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('rDataExplorer.r')) {
        this.config = this.loadConfig();
      }
    });
  }

  /**
   * Load configuration from VS Code settings
   */
  private loadConfig(): IRSessionConfig {
    const config = vscode.workspace.getConfiguration('rDataExplorer.r');
    return {
      timeout: config.get<number>('timeout', 30000),
      maxRetries: config.get<number>('maxRetries', 3),
    };
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${++this.requestCounter}_${Date.now()}`;
  }

  /**
   * Execute R code and return result as JSON
   * @param code - R code to execute
   * @returns Parsed JSON result
   */
  async executeR<T>(code: string): Promise<T> {
    const rExtension = vscode.extensions.getExtension('REditorSupport.r');
    
    if (rExtension && rExtension.isActive) {
      // Use R extension API if available
      return this.executeViaRExtension<T>(code);
    } else {
      // Fallback to terminal execution
      return this.executeViaTerminal<T>(code);
    }
  }

  /**
   * Execute R code via R extension API
   */
  private async executeViaRExtension<T>(code: string): Promise<T> {
    // Note: The actual implementation depends on R extension's API
    // This is a placeholder that can be customized based on the R extension version
    const rExtension = vscode.extensions.getExtension('REditorSupport.r');
    
    if (!rExtension) {
      throw new Error('R extension not found');
    }

    const api = rExtension.exports;
    
    if (api && typeof api.runTextInTerm === 'function') {
      // Create a temp file to store results
      const tempFile = `/tmp/r_data_explorer_${Date.now()}.json`;
      const wrappedCode = `
        .rde_result <- tryCatch({
          ${code}
        }, error = function(e) {
          list(error = conditionMessage(e))
        })
        jsonlite::write_json(.rde_result, "${tempFile}", auto_unbox = TRUE)
        rm(.rde_result)
      `;
      
      await api.runTextInTerm(wrappedCode);
      
      // Read result from temp file (with timeout)
      return this.waitForResult<T>(tempFile);
    }
    
    throw new Error('R extension API not compatible');
  }

  /**
   * Execute R code via terminal
   */
  private async executeViaTerminal<T>(code: string): Promise<T> {
    // This is a simplified implementation
    // In production, you might want to use a background R process
    // or integrate with languageserver
    
    const tempFile = `/tmp/r_data_explorer_${Date.now()}.json`;
    const wrappedCode = `
      .rde_result <- tryCatch({
        ${code}
      }, error = function(e) {
        list(error = conditionMessage(e))
      })
      jsonlite::write_json(.rde_result, "${tempFile}", auto_unbox = TRUE)
      rm(.rde_result)
    `;

    // Send to R terminal
    const terminal = await this.getOrCreateRTerminal();
    terminal.sendText(wrappedCode);

    return this.waitForResult<T>(tempFile);
  }

  /**
   * Wait for result file to be written
   */
  private async waitForResult<T>(filePath: string): Promise<T> {
    const fs = require('fs').promises;
    const startTime = Date.now();

    while (Date.now() - startTime < this.config.timeout) {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        await fs.unlink(filePath); // Clean up
        const result = JSON.parse(content);
        
        if (result.error) {
          throw new Error(result.error);
        }
        
        return result as T;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
        // File not ready yet, wait and retry
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    throw new Error('R execution timeout');
  }

  /**
   * Get or create R terminal
   */
  private async getOrCreateRTerminal(): Promise<vscode.Terminal> {
    // Look for existing R terminal
    const existingTerminal = vscode.window.terminals.find(
      t => t.name === 'R' || t.name.toLowerCase().includes('r terminal')
    );

    if (existingTerminal) {
      return existingTerminal;
    }

    // Create new R terminal
    const terminal = vscode.window.createTerminal({
      name: 'R',
      shellPath: 'R',
      shellArgs: ['--quiet', '--no-save'],
    });

    // Wait for terminal to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    return terminal;
  }

  /**
   * Get list of data frames in R environment
   * @returns Array of data frame metadata
   */
  async listDataFrames(): Promise<IDataFrameMetadata[]> {
    const code = `
      .rde_dfs <- ls(envir = .GlobalEnv)
      .rde_dfs <- .rde_dfs[sapply(.rde_dfs, function(x) is.data.frame(get(x, envir = .GlobalEnv)))]
      lapply(.rde_dfs, function(name) {
        df <- get(name, envir = .GlobalEnv)
        list(
          name = name,
          rows = nrow(df),
          columns = ncol(df),
          size = format(object.size(df), units = "auto"),
          columnNames = names(df)
        )
      })
    `;

    return this.executeR<IDataFrameMetadata[]>(code);
  }

  /**
   * Get data from a data frame
   * @param name - Name of the data frame
   * @param offset - Starting row (0-indexed)
   * @param limit - Number of rows to fetch
   * @param columns - Specific columns to fetch (optional)
   * @returns Data frame data
   */
  async getData(
    name: string,
    offset = 0,
    limit = 10000,
    columns?: string[]
  ): Promise<IDataFrame> {
    const columnsFilter = columns 
      ? `c(${columns.map(c => `"${c}"`).join(', ')})` 
      : 'names(df)';

    const code = `
      df <- get("${name}", envir = .GlobalEnv)
      total_rows <- nrow(df)
      total_cols <- ncol(df)
      
      # Get subset of data
      start_row <- ${offset + 1}
      end_row <- min(${offset + limit}, total_rows)
      selected_cols <- ${columnsFilter}
      
      subset_df <- df[start_row:end_row, selected_cols, drop = FALSE]
      
      # Build column definitions
      columns <- lapply(selected_cols, function(col_name) {
        col <- df[[col_name]]
        col_type <- class(col)[1]
        
        # Map R types
        type_map <- c(
          "numeric" = "numeric",
          "integer" = "integer", 
          "character" = "character",
          "factor" = "factor",
          "logical" = "logical",
          "Date" = "Date",
          "POSIXct" = "POSIXct",
          "POSIXlt" = "POSIXlt"
        )
        
        mapped_type <- ifelse(col_type %in% names(type_map), type_map[col_type], "unknown")
        
        result <- list(
          name = col_name,
          type = mapped_type,
          index = which(names(df) == col_name) - 1,
          hasNA = any(is.na(col))
        )
        
        # Add label if available
        label <- attr(col, "label")
        if (!is.null(label)) {
          result$label <- label
        }
        
        # Add factor levels
        if (is.factor(col)) {
          result$levels <- levels(col)
        }
        
        result
      })
      
      # Convert data to list of rows
      rows <- lapply(1:nrow(subset_df), function(i) {
        as.list(subset_df[i, , drop = FALSE])
      })
      
      list(
        name = "${name}",
        columns = columns,
        rows = rows,
        totalRows = total_rows,
        totalColumns = total_cols,
        hasMore = end_row < total_rows,
        fetchedAt = as.numeric(Sys.time()) * 1000
      )
    `;

    return this.executeR<IDataFrame>(code);
  }

  /**
   * Get column statistics
   * @param dataFrameName - Name of the data frame
   * @param columnName - Name of the column
   * @returns Column statistics
   */
  async getColumnStats(dataFrameName: string, columnName: string): Promise<unknown> {
    const code = `
      df <- get("${dataFrameName}", envir = .GlobalEnv)
      col <- df[["${columnName}"]]
      
      if (is.numeric(col)) {
        list(
          type = "numeric",
          count = length(col),
          missing = sum(is.na(col)),
          mean = mean(col, na.rm = TRUE),
          std = sd(col, na.rm = TRUE),
          min = min(col, na.rm = TRUE),
          max = max(col, na.rm = TRUE),
          median = median(col, na.rm = TRUE),
          q1 = quantile(col, 0.25, na.rm = TRUE),
          q3 = quantile(col, 0.75, na.rm = TRUE)
        )
      } else {
        freq_table <- table(col, useNA = "ifany")
        freq_df <- data.frame(
          value = names(freq_table),
          count = as.integer(freq_table),
          stringsAsFactors = FALSE
        )
        freq_df$percent <- round(freq_df$count / sum(freq_df$count) * 100, 2)
        freq_df <- freq_df[order(-freq_df$count), ]
        
        list(
          type = "categorical",
          count = length(col),
          missing = sum(is.na(col)),
          unique = length(unique(col[!is.na(col)])),
          mode = names(which.max(table(col))),
          frequencies = head(freq_df, 20)
        )
      }
    `;

    return this.executeR(code);
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
    const code = `
      df <- get("${dataFrameName}", envir = .GlobalEnv)
      
      # Apply filter
      filtered_df <- dplyr::filter(df, ${filterExpression})
      
      # Get subset
      total_rows <- nrow(filtered_df)
      start_row <- ${offset + 1}
      end_row <- min(${offset + limit}, total_rows)
      
      subset_df <- filtered_df[start_row:end_row, , drop = FALSE]
      
      # Build response (similar to getData)
      columns <- lapply(names(subset_df), function(col_name) {
        col <- subset_df[[col_name]]
        list(
          name = col_name,
          type = class(col)[1],
          index = which(names(df) == col_name) - 1,
          hasNA = any(is.na(col))
        )
      })
      
      rows <- lapply(1:nrow(subset_df), function(i) {
        as.list(subset_df[i, , drop = FALSE])
      })
      
      list(
        name = "${dataFrameName}",
        columns = columns,
        rows = rows,
        totalRows = total_rows,
        totalColumns = ncol(filtered_df),
        hasMore = end_row < total_rows,
        fetchedAt = as.numeric(Sys.time()) * 1000
      )
    `;

    return this.executeR<IDataFrame>(code);
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    // Clean up pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Session disposed'));
    }
    this.pendingRequests.clear();
  }
}

// Export singleton instance
export const rSession = new RSession();

// Also export class for testing
export { RSession };

