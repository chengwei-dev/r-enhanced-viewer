/**
 * Viewer Module
 * Main module for displaying data frames in a spreadsheet-like grid
 */

import { IModule, IToolbarItem, IContextMenuItem, IDataFrame, ISelection } from '../../core/types';
import { eventBus } from '../../core/eventBus';
import { ViewerPanel } from './ViewerPanel';

/**
 * ViewerModule class - Core data viewing functionality
 */
export class ViewerModule implements IModule {
  id = 'viewer';
  name = 'Data Viewer';
  version = '1.0.0';
  enabled = true;

  private panel: ViewerPanel | null = null;
  private currentData: IDataFrame | null = null;

  /**
   * Activate the viewer module
   */
  async activate(): Promise<void> {
    console.log('Viewer module activating...');

    // Subscribe to data events
    eventBus.on('data:loaded', ({ data }) => {
      this.currentData = data;
      if (this.panel) {
        this.panel.updateData(data);
      }
    });

    console.log('Viewer module activated');
  }

  /**
   * Deactivate the viewer module
   */
  async deactivate(): Promise<void> {
    console.log('Viewer module deactivating...');

    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
    }

    this.currentData = null;
    console.log('Viewer module deactivated');
  }

  /**
   * Get toolbar items provided by this module
   */
  getToolbarItems(): IToolbarItem[] {
    return [
      {
        id: 'viewer-refresh',
        moduleId: this.id,
        icon: 'refresh',
        tooltip: 'Refresh Data',
        onClick: () => this.refresh(),
        order: 10,
      },
      {
        id: 'viewer-export',
        moduleId: this.id,
        icon: 'export',
        tooltip: 'Export Data',
        onClick: () => this.exportData(),
        order: 20,
      },
    ];
  }

  /**
   * Get context menu items provided by this module
   */
  getContextMenuItems(): IContextMenuItem[] {
    return [
      {
        id: 'viewer-copy',
        moduleId: this.id,
        label: 'Copy',
        icon: 'copy',
        onClick: (context) => this.copySelection(context.selection),
        order: 10,
      },
      {
        id: 'viewer-copy-with-header',
        moduleId: this.id,
        label: 'Copy with Headers',
        icon: 'copy',
        onClick: (context) => this.copySelection(context.selection, true),
        order: 11,
      },
    ];
  }

  /**
   * Handle data change event
   */
  onDataChange(data: IDataFrame): void {
    this.currentData = data;
    if (this.panel) {
      this.panel.updateData(data);
    }
  }

  /**
   * Handle selection change event
   */
  onSelectionChange(selection: ISelection): void {
    eventBus.emit('selection:changed', { selection });
  }

  /**
   * Show the viewer panel with a data frame
   * @param dataFrameName - Name of the data frame to view
   */
  async show(dataFrameName: string): Promise<void> {
    if (!this.panel) {
      this.panel = new ViewerPanel(dataFrameName);
    } else {
      this.panel.reveal(dataFrameName);
    }
  }

  /**
   * Get the current panel
   */
  getPanel(): ViewerPanel | null {
    return this.panel;
  }

  /**
   * Set the panel instance
   */
  setPanel(panel: ViewerPanel | null): void {
    this.panel = panel;
  }

  /**
   * Refresh current data
   */
  private refresh(): void {
    if (this.panel) {
      this.panel.refresh();
    }
  }

  /**
   * Export current data
   */
  private exportData(): void {
    // TODO: Implement export functionality
    console.log('Export not yet implemented');
  }

  /**
   * Copy selection to clipboard
   */
  private copySelection(selection: ISelection, withHeaders = false): void {
    if (!this.currentData || selection.type === 'none') {
      return;
    }

    // TODO: Implement copy functionality
    console.log('Copy selection:', selection, 'withHeaders:', withHeaders);
  }
}

// Export singleton instance
export const viewerModule = new ViewerModule();

