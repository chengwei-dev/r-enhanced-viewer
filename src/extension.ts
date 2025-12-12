/**
 * R Enhanced Viewer (REViewer) - VS Code Extension Entry Point
 * Enhanced data frame viewer for R statistical programmers
 */

import * as vscode from 'vscode';
import { moduleRegistry } from './core/moduleRegistry';
import { eventBus } from './core/eventBus';
import { dataProvider } from './core/dataProvider';
import { ViewerPanel } from './modules/viewer/ViewerPanel';
import { viewerModule } from './modules/viewer';

// Store extension context globally for access in modules
let extensionContext: vscode.ExtensionContext;

/**
 * Extension activation
 * Called when the extension is activated
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('R Enhanced Viewer is activating...');
  extensionContext = context;

  // Register core modules
  registerModules();

  // Register commands
  registerCommands(context);

  // Activate all enabled modules
  await moduleRegistry.activateAll(context);

  // Watch for theme changes
  vscode.window.onDidChangeActiveColorTheme((theme) => {
    const themeKind = theme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';
    eventBus.emit('theme:changed', { theme: themeKind });
  });

  console.log('R Enhanced Viewer activated successfully');
}

/**
 * Register all feature modules
 */
function registerModules(): void {
  // Register viewer module (always enabled)
  moduleRegistry.register(viewerModule);

  // Future modules can be registered here:
  // moduleRegistry.register(filterModule);
  // moduleRegistry.register(statisticsModule);
  // moduleRegistry.register(columnManagerModule);
}

/**
 * Register extension commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
  // Command: View Data Frame
  const viewDataFrameCmd = vscode.commands.registerCommand(
    'reviewer.viewDataFrame',
    async () => {
      // Get list of available data frames
      try {
        const dataFrames = await dataProvider.listDataFrames();

        if (dataFrames.length === 0) {
          vscode.window.showInformationMessage(
            'No data frames found in R environment. Load some data first.'
          );
          return;
        }

        // Show quick pick to select data frame
        const items = dataFrames.map((df) => ({
          label: df.name,
          description: `${df.rows} rows × ${df.columns} cols`,
          detail: df.size,
          dataFrame: df,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a data frame to view',
          matchOnDescription: true,
        });

        if (selected) {
          ViewerPanel.createOrShow(context.extensionUri, selected.label);
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to list data frames: ${(error as Error).message}`
        );
      }
    }
  );

  // Command: Refresh View
  const refreshViewCmd = vscode.commands.registerCommand(
    'reviewer.refreshView',
    async () => {
      const panel = viewerModule.getPanel();
      if (panel) {
        await panel.refresh();
        vscode.window.showInformationMessage('Data refreshed');
      } else {
        vscode.window.showInformationMessage('No active data view to refresh');
      }
    }
  );

  // Command: View Variable (from editor selection)
  const viewVariableCmd = vscode.commands.registerCommand(
    'reviewer.viewVariable',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      // Get selected text or word at cursor
      let variableName = editor.document.getText(editor.selection);
      if (!variableName) {
        const wordRange = editor.document.getWordRangeAtPosition(editor.selection.active);
        if (wordRange) {
          variableName = editor.document.getText(wordRange);
        }
      }

      if (variableName) {
        ViewerPanel.createOrShow(context.extensionUri, variableName);
      } else {
        vscode.window.showInformationMessage('No variable selected');
      }
    }
  );

  context.subscriptions.push(viewDataFrameCmd, refreshViewCmd, viewVariableCmd);
}

/**
 * Extension deactivation
 * Called when the extension is deactivated
 */
export async function deactivate(): Promise<void> {
  console.log('R Enhanced Viewer is deactivating...');

  // Deactivate all modules
  await moduleRegistry.deactivateAll();

  // Clear event bus
  eventBus.clearAll();

  // Dispose data provider
  dataProvider.dispose();

  console.log('R Enhanced Viewer deactivated');
}

/**
 * Get extension context (for use in modules)
 */
export function getExtensionContext(): vscode.ExtensionContext {
  return extensionContext;
}

