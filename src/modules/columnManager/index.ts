/**
 * Column Manager Module
 * Provides column reordering, hiding, and resizing functionality
 * 
 * Status: Skeleton - Ready for implementation
 */

import { IModule, IToolbarItem, IContextMenuItem, IDataFrame, IMenuContext } from '../../core/types';
import { eventBus } from '../../core/eventBus';

/**
 * Column visibility and order state
 */
interface IColumnState {
  name: string;
  visible: boolean;
  width: number;
  order: number;
  pinned: 'left' | 'right' | null;
}

/**
 * ColumnManagerModule class - Column management functionality
 */
export class ColumnManagerModule implements IModule {
  id = 'columnManager';
  name = 'Column Manager';
  version = '1.0.0';
  enabled = true;
  dependencies = ['viewer']; // Depends on viewer module

  private columnStates: Map<string, IColumnState> = new Map();
  private currentData: IDataFrame | null = null;

  /**
   * Activate the column manager module
   */
  async activate(): Promise<void> {
    console.log('Column Manager module activating...');

    // Listen for data changes
    eventBus.on('data:loaded', ({ data }) => {
      this.onDataChange(data);
    });

    console.log('Column Manager module activated');
  }

  /**
   * Deactivate the column manager module
   */
  async deactivate(): Promise<void> {
    console.log('Column Manager module deactivating...');
    this.columnStates.clear();
    this.currentData = null;
    console.log('Column Manager module deactivated');
  }

  /**
   * Get toolbar items provided by this module
   */
  getToolbarItems(): IToolbarItem[] {
    return [
      {
        id: 'columns-manage',
        moduleId: this.id,
        icon: 'columns',
        tooltip: 'Manage Columns',
        onClick: () => this.showColumnManager(),
        order: 50,
      },
      {
        id: 'columns-reset',
        moduleId: this.id,
        icon: 'reset',
        tooltip: 'Reset Column Order',
        onClick: () => this.resetColumnOrder(),
        order: 51,
      },
    ];
  }

  /**
   * Get context menu items provided by this module
   */
  getContextMenuItems(): IContextMenuItem[] {
    return [
      {
        id: 'column-hide',
        moduleId: this.id,
        label: 'Hide Column',
        icon: 'eye-closed',
        onClick: (context) => this.hideColumn(context),
        when: (context) => context.columnDef !== undefined,
        order: 20,
      },
      {
        id: 'column-pin-left',
        moduleId: this.id,
        label: 'Pin to Left',
        icon: 'pin',
        onClick: (context) => this.pinColumn(context, 'left'),
        when: (context) => context.columnDef !== undefined,
        order: 21,
      },
      {
        id: 'column-pin-right',
        moduleId: this.id,
        label: 'Pin to Right',
        icon: 'pin',
        onClick: (context) => this.pinColumn(context, 'right'),
        when: (context) => context.columnDef !== undefined,
        order: 22,
      },
    ];
  }

  /**
   * Handle data change event
   */
  onDataChange(data: IDataFrame): void {
    this.currentData = data;
    this.initializeColumnStates(data);
  }

  /**
   * Initialize column states from data frame
   */
  private initializeColumnStates(data: IDataFrame): void {
    // Preserve existing states if columns haven't changed
    const existingNames = new Set(this.columnStates.keys());
    const newNames = new Set(data.columns.map((c) => c.name));

    // Remove states for columns that no longer exist
    for (const name of existingNames) {
      if (!newNames.has(name)) {
        this.columnStates.delete(name);
      }
    }

    // Add states for new columns
    data.columns.forEach((col, index) => {
      if (!this.columnStates.has(col.name)) {
        this.columnStates.set(col.name, {
          name: col.name,
          visible: true,
          width: 150,
          order: index,
          pinned: null,
        });
      }
    });
  }

  /**
   * Show column manager dialog
   */
  private showColumnManager(): void {
    // TODO: Send message to webview to show column manager UI
    console.log('Show column manager');
  }

  /**
   * Reset column order to original
   */
  private resetColumnOrder(): void {
    if (!this.currentData) {
      return;
    }

    this.currentData.columns.forEach((col, index) => {
      const state = this.columnStates.get(col.name);
      if (state) {
        state.visible = true;
        state.order = index;
        state.pinned = null;
      }
    });

    this.emitColumnChange();
  }

  /**
   * Hide a column
   */
  private hideColumn(context: IMenuContext): void {
    if (!context.columnDef) {
      return;
    }

    const state = this.columnStates.get(context.columnDef.name);
    if (state) {
      state.visible = false;
      eventBus.emit('columns:visibility', {
        column: context.columnDef.name,
        visible: false,
      });
    }
  }

  /**
   * Pin a column
   */
  private pinColumn(context: IMenuContext, side: 'left' | 'right'): void {
    if (!context.columnDef) {
      return;
    }

    const state = this.columnStates.get(context.columnDef.name);
    if (state) {
      state.pinned = state.pinned === side ? null : side;
      this.emitColumnChange();
    }
  }

  /**
   * Show a hidden column
   */
  showColumn(columnName: string): void {
    const state = this.columnStates.get(columnName);
    if (state) {
      state.visible = true;
      eventBus.emit('columns:visibility', {
        column: columnName,
        visible: true,
      });
    }
  }

  /**
   * Reorder columns
   */
  reorderColumns(columnOrder: string[]): void {
    columnOrder.forEach((name, index) => {
      const state = this.columnStates.get(name);
      if (state) {
        state.order = index;
      }
    });

    eventBus.emit('columns:reordered', { columns: columnOrder });
  }

  /**
   * Resize a column
   */
  resizeColumn(columnName: string, width: number): void {
    const state = this.columnStates.get(columnName);
    if (state) {
      state.width = Math.max(50, Math.min(500, width));
    }
  }

  /**
   * Get visible columns in order
   */
  getVisibleColumns(): string[] {
    return Array.from(this.columnStates.values())
      .filter((s) => s.visible)
      .sort((a, b) => {
        // Pinned left columns first
        if (a.pinned === 'left' && b.pinned !== 'left') return -1;
        if (b.pinned === 'left' && a.pinned !== 'left') return 1;
        // Pinned right columns last
        if (a.pinned === 'right' && b.pinned !== 'right') return 1;
        if (b.pinned === 'right' && a.pinned !== 'right') return -1;
        // Sort by order
        return a.order - b.order;
      })
      .map((s) => s.name);
  }

  /**
   * Get hidden columns
   */
  getHiddenColumns(): string[] {
    return Array.from(this.columnStates.values())
      .filter((s) => !s.visible)
      .map((s) => s.name);
  }

  /**
   * Emit column change event
   */
  private emitColumnChange(): void {
    eventBus.emit('columns:reordered', {
      columns: this.getVisibleColumns(),
    });
  }
}

// Export singleton instance
export const columnManagerModule = new ColumnManagerModule();

