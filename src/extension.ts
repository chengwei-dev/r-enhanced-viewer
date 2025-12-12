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
import { REViewerServer, setServerInstance } from './core/httpServer';
import { IDataFrame } from './core/types';

// Store extension context globally for access in modules
let extensionContext: vscode.ExtensionContext;

// HTTP server for R communication
let httpServer: REViewerServer | null = null;

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

  // Start HTTP server for R communication
  await startHttpServer(context);

  // Watch for theme changes
  vscode.window.onDidChangeActiveColorTheme((theme) => {
    const themeKind = theme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';
    eventBus.emit('theme:changed', { theme: themeKind });
  });

  console.log('R Enhanced Viewer activated successfully');
}

/**
 * Start HTTP server for R communication
 */
async function startHttpServer(context: vscode.ExtensionContext): Promise<void> {
  try {
    httpServer = new REViewerServer(context.extensionUri);
    
    // Set callback to open viewer when data is received from R
    httpServer.setOnDataReceived((data: IDataFrame) => {
      // Open or update the viewer panel with the received data
      ViewerPanel.createOrShowWithData(context.extensionUri, data);
    });

    await httpServer.start();
    setServerInstance(httpServer);
    
    // Show status bar item
    const statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    statusBarItem.text = `$(broadcast) REViewer: ${httpServer.getPort()}`;
    statusBarItem.tooltip = `REViewer listening on port ${httpServer.getPort()}\nUse REView(df) in R to view data`;
    statusBarItem.command = 'reviewer.showServerInfo';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    console.log(`✓ REViewer HTTP server started on port ${httpServer.getPort()}`);
  } catch (error) {
    console.error('Failed to start REViewer HTTP server:', error);
    vscode.window.showWarningMessage(
      `REViewer: HTTP server failed to start. REView() from R will not work. Error: ${(error as Error).message}`
    );
  }
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

  // Command: Show Server Info
  const showServerInfoCmd = vscode.commands.registerCommand(
    'reviewer.showServerInfo',
    async () => {
      if (httpServer && httpServer.isRunning()) {
        const port = httpServer.getPort();
        const action = await vscode.window.showInformationMessage(
          `REViewer server is running on port ${port}\n\nUse REView(df) in R to view data frames.`,
          'Copy R Code',
          'View Documentation'
        );
        
        if (action === 'Copy R Code') {
          const rCode = `# Install once (if not installed):
# install.packages(c("jsonlite", "httr"))

# Define REView function:
REView <- function(x, port = ${port}) {
  if (!requireNamespace("jsonlite", quietly = TRUE)) stop("Install jsonlite: install.packages('jsonlite')")
  if (!requireNamespace("httr", quietly = TRUE)) stop("Install httr: install.packages('httr')")
  
  var_name <- deparse(substitute(x))
  if (!is.data.frame(x)) x <- as.data.frame(x)
  
  json_data <- jsonlite::toJSON(list(
    name = var_name,
    data = x,
    nrow = nrow(x),
    ncol = ncol(x),
    colnames = colnames(x),
    coltypes = sapply(x, function(col) class(col)[1])
  ), auto_unbox = TRUE)
  
  tryCatch({
    httr::POST(paste0("http://localhost:", port, "/review"),
               body = json_data, encode = "json", httr::timeout(5))
    message("✓ Sent to REViewer: ", var_name)
  }, error = function(e) message("✗ REViewer not available"))
  invisible(x)
}

# Example usage:
# REView(mtcars)
# iris %>% REView()`;
          await vscode.env.clipboard.writeText(rCode);
          vscode.window.showInformationMessage('R code copied to clipboard!');
        }
      } else {
        vscode.window.showWarningMessage('REViewer server is not running');
      }
    }
  );

  context.subscriptions.push(viewDataFrameCmd, refreshViewCmd, viewVariableCmd, showServerInfoCmd);
}

/**
 * Extension deactivation
 * Called when the extension is deactivated
 */
export async function deactivate(): Promise<void> {
  console.log('R Enhanced Viewer is deactivating...');

  // Stop HTTP server
  if (httpServer) {
    httpServer.stop();
    httpServer = null;
  }

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

