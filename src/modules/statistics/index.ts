/**
 * Statistics Module
 * Provides summary statistics for data frames
 * 
 * Status: Skeleton - Ready for implementation
 */

import {
  IModule,
  IToolbarItem,
  IDataFrame,
  ISelection,
  IColumnStats,
  INumericStats,
  ICategoricalStats,
} from '../../core/types';
import { eventBus } from '../../core/eventBus';
import { dataProvider } from '../../core/dataProvider';

/**
 * StatisticsModule class - Summary statistics functionality
 */
export class StatisticsModule implements IModule {
  id = 'statistics';
  name = 'Statistics Panel';
  version = '1.0.0';
  enabled = true;
  dependencies = ['viewer']; // Depends on viewer module

  private currentData: IDataFrame | null = null;
  private cachedStats: Map<string, IColumnStats> = new Map();
  private panelVisible = false;

  /**
   * Activate the statistics module
   */
  async activate(): Promise<void> {
    console.log('Statistics module activating...');

    // Listen for data changes
    eventBus.on('data:loaded', ({ data }) => {
      this.onDataChange(data);
    });

    // Listen for selection changes
    eventBus.on('selection:changed', ({ selection }) => {
      this.onSelectionChange(selection);
    });

    console.log('Statistics module activated');
  }

  /**
   * Deactivate the statistics module
   */
  async deactivate(): Promise<void> {
    console.log('Statistics module deactivating...');
    this.currentData = null;
    this.cachedStats.clear();
    this.panelVisible = false;
    console.log('Statistics module deactivated');
  }

  /**
   * Get toolbar items provided by this module
   */
  getToolbarItems(): IToolbarItem[] {
    return [
      {
        id: 'stats-toggle',
        moduleId: this.id,
        icon: 'graph',
        tooltip: 'Toggle Statistics Panel',
        onClick: () => this.toggleStatsPanel(),
        order: 40,
      },
    ];
  }

  /**
   * Handle data change event
   */
  onDataChange(data: IDataFrame): void {
    this.currentData = data;
    this.cachedStats.clear(); // Clear cache when data changes
    console.log(`Statistics module received data: ${data.name}`);
  }

  /**
   * Handle selection change event
   */
  onSelectionChange(selection: ISelection): void {
    if (selection.type === 'column' && selection.columns?.length === 1) {
      // Auto-calculate stats for selected column
      const columnIndex = selection.columns[0];
      if (this.currentData && this.panelVisible) {
        const column = this.currentData.columns[columnIndex];
        this.getColumnStats(column.name);
      }
    }
  }

  /**
   * Toggle statistics panel visibility
   */
  private toggleStatsPanel(): void {
    this.panelVisible = !this.panelVisible;
    // TODO: Send message to webview to show/hide stats panel
    console.log(`Statistics panel ${this.panelVisible ? 'shown' : 'hidden'}`);
  }

  /**
   * Get statistics for a column
   */
  async getColumnStats(columnName: string): Promise<IColumnStats | null> {
    if (!this.currentData) {
      return null;
    }

    // Check cache
    if (this.cachedStats.has(columnName)) {
      return this.cachedStats.get(columnName)!;
    }

    try {
      const stats = await dataProvider.getColumnStats(this.currentData.name, columnName);
      this.cachedStats.set(columnName, stats);

      eventBus.emit('stats:calculated', {
        columnName,
        stats,
      });

      return stats;
    } catch (error) {
      console.error(`Failed to get stats for column ${columnName}:`, error);
      return null;
    }
  }

  /**
   * Get summary statistics for all numeric columns
   */
  async getNumericSummary(): Promise<Map<string, INumericStats>> {
    const summary = new Map<string, INumericStats>();

    if (!this.currentData) {
      return summary;
    }

    const numericColumns = this.currentData.columns.filter(
      (col) => col.type === 'numeric' || col.type === 'integer'
    );

    for (const col of numericColumns) {
      const stats = await this.getColumnStats(col.name);
      if (stats && 'mean' in stats) {
        summary.set(col.name, stats as INumericStats);
      }
    }

    return summary;
  }

  /**
   * Get frequency table for a categorical column
   */
  async getFrequencyTable(columnName: string): Promise<ICategoricalStats | null> {
    const stats = await this.getColumnStats(columnName);
    if (stats && 'frequencies' in stats) {
      return stats as ICategoricalStats;
    }
    return null;
  }

  /**
   * Calculate statistics for selected cells
   */
  calculateSelectionStats(values: number[]): Partial<INumericStats> | null {
    if (values.length === 0) {
      return null;
    }

    const validValues = values.filter((v) => v !== null && !isNaN(v));
    if (validValues.length === 0) {
      return null;
    }

    const sum = validValues.reduce((a, b) => a + b, 0);
    const mean = sum / validValues.length;
    const sorted = [...validValues].sort((a, b) => a - b);

    return {
      count: validValues.length,
      missing: values.length - validValues.length,
      mean,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median: sorted[Math.floor(sorted.length / 2)],
    };
  }
}

// Export singleton instance
export const statisticsModule = new StatisticsModule();

