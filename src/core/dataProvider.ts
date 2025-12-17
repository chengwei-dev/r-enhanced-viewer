/**
 * Data Provider
 * High-level abstraction for data operations
 * Handles caching, pagination, and data transformation
 */

import * as vscode from 'vscode';
import { IDataFrame, IDataFrameMetadata, IFilterState, ISortSpec, IColumnStats } from './types';
import { rSession } from './rSession';
import { eventBus } from './eventBus';
import { getMockDataFrameList, getMockDataFrame } from './mockData';

/**
 * Cache entry for data frames
 */
interface ICacheEntry {
  data: IDataFrame;
  timestamp: number;
  filter?: IFilterState;
  sort?: ISortSpec[];
}

/**
 * DataProvider class for managing data operations
 */
class DataProvider {
  private cache: Map<string, ICacheEntry> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes
  private maxRowsPerRequest: number;
  private useMockData: boolean;

  constructor() {
    const config = vscode.workspace.getConfiguration('reviewer');
    this.maxRowsPerRequest = config.get<number>('viewer.maxRowsInitialLoad', 10000);
    this.useMockData = config.get<boolean>('dev.useMockData', false);

    // Watch for configuration changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('reviewer')) {
        const config = vscode.workspace.getConfiguration('reviewer');
        this.maxRowsPerRequest = config.get<number>('viewer.maxRowsInitialLoad', 10000);
        this.useMockData = config.get<boolean>('dev.useMockData', false);
      }
    });
  }

  /**
   * Check if R session is connected
   */
  isRSessionConnected(): boolean {
    return rSession.isConnected();
  }

  /**
   * Check if using mock data mode
   */
  isUsingMockData(): boolean {
    return this.useMockData;
  }

  /**
   * Get list of available data frames
   * @returns Array of data frame metadata
   */
  async listDataFrames(): Promise<IDataFrameMetadata[]> {
    // Use mock data in development mode
    if (this.useMockData) {
      console.log('[DEV MODE] Using mock data frames');
      return getMockDataFrameList();
    }

    // Check if R session is connected
    if (!rSession.isConnected()) {
      throw new Error(
        'R session not connected. Run reviewer_connect() in R, or use REView(df) directly.'
      );
    }

    try {
      return await rSession.listDataFrames();
    } catch (error) {
      console.error('Failed to list data frames:', error);
      throw error;
    }
  }

  /**
   * Get data frame data
   * @param name - Name of the data frame
   * @param options - Options for data retrieval
   * @returns Data frame data
   */
  async getData(
    name: string,
    options: {
      offset?: number;
      limit?: number;
      columns?: string[];
      useCache?: boolean;
    } = {}
  ): Promise<IDataFrame> {
    const { offset = 0, limit = this.maxRowsPerRequest, columns, useCache = true } = options;

    // Check cache first
    if (useCache) {
      const cached = this.getCached(name);
      if (cached && !columns && offset === 0 && limit >= cached.totalRows) {
        return cached;
      }
    }

    // Emit loading event
    eventBus.emit('data:loading', { dataFrameName: name });

    // Use mock data in development mode
    if (this.useMockData) {
      console.log(`[DEV MODE] Loading mock data: ${name}`);
      const mockData = getMockDataFrame(name);
      if (!mockData) {
        const error = `Mock data frame "${name}" not found`;
        eventBus.emit('data:error', { error });
        throw new Error(error);
      }

      // Cache mock data
      this.setCache(name, mockData);

      // Emit loaded event
      eventBus.emit('data:loaded', { data: mockData });

      return mockData;
    }

    // Check if R session is connected
    if (!rSession.isConnected()) {
      const error = 'R session not connected. Run reviewer_connect() in R.';
      eventBus.emit('data:error', { error });
      throw new Error(error);
    }

    try {
      const data = await rSession.getData(name, offset, limit, columns);

      // Cache full data frame
      if (!columns && offset === 0) {
        this.setCache(name, data);
      }

      // Emit loaded event
      eventBus.emit('data:loaded', { data });

      return data;
    } catch (error) {
      eventBus.emit('data:error', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get filtered data
   * @param name - Name of the data frame
   * @param filter - Filter state
   * @param options - Additional options
   * @returns Filtered data
   */
  async getFilteredData(
    name: string,
    filter: IFilterState,
    options: {
      offset?: number;
      limit?: number;
    } = {}
  ): Promise<IDataFrame> {
    const { offset = 0, limit = this.maxRowsPerRequest } = options;

    // Convert filter state to R expression
    const filterExpression = this.filterStateToRExpression(filter);

    if (!filterExpression) {
      // No filter, return regular data
      return this.getData(name, { offset, limit });
    }

    eventBus.emit('data:loading', { dataFrameName: name });

    try {
      const data = await rSession.getFilteredData(name, filterExpression, offset, limit);

      eventBus.emit('data:filtered', {
        filter,
        resultCount: data.totalRows,
      });

      return data;
    } catch (error) {
      eventBus.emit('data:error', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get column statistics
   * @param dataFrameName - Name of the data frame
   * @param columnName - Name of the column
   * @returns Column statistics
   */
  async getColumnStats(dataFrameName: string, columnName: string): Promise<IColumnStats> {
    try {
      const stats = (await rSession.getColumnStats(dataFrameName, columnName)) as IColumnStats;

      eventBus.emit('stats:calculated', {
        columnName,
        stats,
      });

      return stats;
    } catch (error) {
      console.error('Failed to get column stats:', error);
      throw error;
    }
  }

  /**
   * Refresh data for a data frame (bypass cache)
   * @param name - Name of the data frame
   * @returns Fresh data
   */
  async refreshData(name: string): Promise<IDataFrame> {
    this.invalidateCache(name);
    return this.getData(name, { useCache: false });
  }

  /**
   * Convert filter state to R expression
   */
  private filterStateToRExpression(filter: IFilterState): string | null {
    if (!filter.enabled) {
      return null;
    }

    const expressions: string[] = [];

    // Global search
    if (filter.globalSearch) {
      // Search across all character columns
      expressions.push(
        `rowSums(sapply(select_if(., is.character), function(x) grepl("${filter.globalSearch}", x, ignore.case = TRUE))) > 0`
      );
    }

    // Filter groups
    for (const group of filter.groups) {
      const groupExpr = this.filterGroupToRExpression(group);
      if (groupExpr) {
        expressions.push(groupExpr);
      }
    }

    if (expressions.length === 0) {
      return null;
    }

    return expressions.join(' & ');
  }

  /**
   * Convert a filter group to R expression
   */
  private filterGroupToRExpression(
    group: IFilterState['groups'][0]
  ): string | null {
    const expressions: string[] = [];

    for (const item of group.conditions) {
      if ('logic' in item) {
        // Nested group
        const nested = this.filterGroupToRExpression(item);
        if (nested) {
          expressions.push(`(${nested})`);
        }
      } else {
        // Single condition
        const expr = this.conditionToRExpression(item);
        if (expr) {
          expressions.push(expr);
        }
      }
    }

    if (expressions.length === 0) {
      return null;
    }

    const operator = group.logic === 'AND' ? ' & ' : ' | ';
    return expressions.join(operator);
  }

  /**
   * Convert a single filter condition to R expression
   */
  private conditionToRExpression(
    condition: IFilterState['groups'][0]['conditions'][0]
  ): string | null {
    if ('logic' in condition) {
      return null; // This is a group, not a condition
    }

    const { columnName, operator, value, value2, values } = condition;
    const col = `\`${columnName}\``;

    switch (operator) {
      case 'equals':
        return typeof value === 'string'
          ? `${col} == "${value}"`
          : `${col} == ${value}`;
      case 'notEquals':
        return typeof value === 'string'
          ? `${col} != "${value}"`
          : `${col} != ${value}`;
      case 'contains':
        return `grepl("${value}", ${col}, ignore.case = TRUE)`;
      case 'notContains':
        return `!grepl("${value}", ${col}, ignore.case = TRUE)`;
      case 'startsWith':
        return `grepl("^${value}", ${col})`;
      case 'endsWith':
        return `grepl("${value}$", ${col})`;
      case 'greaterThan':
        return `${col} > ${value}`;
      case 'greaterThanOrEqual':
        return `${col} >= ${value}`;
      case 'lessThan':
        return `${col} < ${value}`;
      case 'lessThanOrEqual':
        return `${col} <= ${value}`;
      case 'between':
        return `${col} >= ${value} & ${col} <= ${value2}`;
      case 'isNA':
        return `is.na(${col})`;
      case 'isNotNA':
        return `!is.na(${col})`;
      case 'inList':
        if (values && values.length > 0) {
          const valuesStr = values
            .map((v) => (typeof v === 'string' ? `"${v}"` : v))
            .join(', ');
          return `${col} %in% c(${valuesStr})`;
        }
        return null;
      default:
        return null;
    }
  }

  /**
   * Get cached data
   */
  private getCached(name: string): IDataFrame | null {
    const entry = this.cache.get(name);
    if (!entry) {
      return null;
    }

    // Check if cache is expired
    if (Date.now() - entry.timestamp > this.cacheTimeout) {
      this.cache.delete(name);
      return null;
    }

    return entry.data;
  }

  /**
   * Set cache entry
   */
  private setCache(
    name: string,
    data: IDataFrame,
    filter?: IFilterState,
    sort?: ISortSpec[]
  ): void {
    this.cache.set(name, {
      data,
      timestamp: Date.now(),
      filter,
      sort,
    });
  }

  /**
   * Invalidate cache for a data frame
   */
  private invalidateCache(name: string): void {
    this.cache.delete(name);
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.clearCache();
  }
}

// Export singleton instance
export const dataProvider = new DataProvider();

// Also export class for testing
export { DataProvider };

