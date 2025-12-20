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
import { vscodeRConnection } from './core/vscodeRApi';

// Store extension context globally for access in modules
let extensionContext: vscode.ExtensionContext;

// HTTP server for R communication
let httpServer: REViewerServer | null = null;

// vscode-r connection status
let vscodeRAvailable = false;
let rSessionInitialized = false;

// Status bar items
let serverStatusBarItem: vscode.StatusBarItem | null = null;
let rSessionStatusBarItem: vscode.StatusBarItem | null = null;

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

  // Initialize vscode-r connection
  await initializeVscodeR(context);

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

    // Set R session status change callbacks
    httpServer.setOnRSessionStatusChange(
      () => updateRSessionStatus(true),
      () => updateRSessionStatus(false)
    );

    await httpServer.start();
    setServerInstance(httpServer);
    
    // Create server status bar item
    serverStatusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    serverStatusBarItem.text = `$(broadcast) REViewer: ${httpServer.getPort()}`;
    serverStatusBarItem.tooltip = `REViewer listening on port ${httpServer.getPort()}\nUse REView(df) in R to view data`;
    serverStatusBarItem.command = 'reviewer.showServerInfo';
    serverStatusBarItem.show();
    context.subscriptions.push(serverStatusBarItem);

    // Create R session status bar item
    rSessionStatusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      99
    );
    updateRSessionStatus(false);
    rSessionStatusBarItem.show();
    context.subscriptions.push(rSessionStatusBarItem);

    console.log(`✓ REViewer HTTP server started on port ${httpServer.getPort()}`);
  } catch (error) {
    console.error('Failed to start REViewer HTTP server:', error);
    vscode.window.showWarningMessage(
      `REViewer: HTTP server failed to start. REView() from R will not work. Error: ${(error as Error).message}`
    );
  }
}

/**
 * Initialize vscode-r connection
 */
async function initializeVscodeR(context: vscode.ExtensionContext): Promise<void> {
  try {
    vscodeRAvailable = await vscodeRConnection.initialize();
    
    if (vscodeRAvailable) {
      console.log('✓ vscode-r extension detected - zero-config mode enabled');
      
      // Update status bar to show vscode-r mode
      if (rSessionStatusBarItem) {
        rSessionStatusBarItem.text = '$(zap) R Ready';
        rSessionStatusBarItem.tooltip = 'vscode-r detected. Click "View Data Frame" to browse R data.';
        rSessionStatusBarItem.backgroundColor = undefined;
      }
    } else {
      console.log('vscode-r extension not found - using manual connection mode');
    }
  } catch (error) {
    console.error('Error initializing vscode-r:', error);
    vscodeRAvailable = false;
  }
}

/**
 * Initialize R session with REViewer functions (inject code into R)
 */
async function initializeRSession(): Promise<boolean> {
  if (!vscodeRAvailable) {
    return false;
  }

  try {
    // Check if R terminal is available
    const hasRSession = await vscodeRConnection.isRSessionReady();
    if (!hasRSession) {
      vscode.window.showWarningMessage(
        'No R terminal found. Please start an R session first (Cmd+Shift+P → "R: Create R Terminal").'
      );
      return false;
    }

    // Inject REViewer functions into R
    const port = httpServer?.getPort() || 8765;
    await vscodeRConnection.initializeRSession(port);
    rSessionInitialized = true;
    
    // Give R a moment to process the initialization
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return true;
  } catch (error) {
    console.error('Failed to initialize R session:', error);
    return false;
  }
}

/**
 * Update R session status in status bar
 */
function updateRSessionStatus(connected: boolean): void {
  if (!rSessionStatusBarItem) return;
  
  if (connected) {
    rSessionStatusBarItem.text = '$(check) R Connected';
    rSessionStatusBarItem.tooltip = 'R session connected. Ready to use Cmd+Shift+P → View Data Frame';
    rSessionStatusBarItem.backgroundColor = undefined;
  } else {
    rSessionStatusBarItem.text = '$(plug) R Disconnected';
    rSessionStatusBarItem.tooltip = 'Click to see how to connect R session';
    rSessionStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }
  rSessionStatusBarItem.command = 'reviewer.showConnectionHelp';
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
      // Try to initialize vscode-r connection dynamically (in case it wasn't ready at activation)
      if (!vscodeRAvailable) {
        vscodeRAvailable = await vscodeRConnection.initialize();
        if (vscodeRAvailable) {
          console.log('✓ vscode-r extension detected dynamically - zero-config mode enabled');
        }
      }

      // Strategy 1: Use vscode-r extension if available (zero-config mode)
      if (vscodeRAvailable) {
        await handleViewDataFrameWithVscodeR(context);
        return;
      }

      // Strategy 2: Use manual HTTP connection
      if (dataProvider.isRSessionConnected()) {
        await handleViewDataFrameWithHttpConnection(context);
        return;
      }

      // Strategy 3: Mock data mode
      if (dataProvider.isUsingMockData()) {
        await handleViewDataFrameWithMock(context);
        return;
      }

      // No connection available - show help
      const action = await vscode.window.showWarningMessage(
        'No R connection available. Install vscode-r extension for best experience.',
        'Install vscode-r',
        'Show Manual Setup',
        'Use Mock Data'
      );
      
      if (action === 'Install vscode-r') {
        vscode.commands.executeCommand(
          'workbench.extensions.installExtension',
          'REditorSupport.r'
        );
      } else if (action === 'Show Manual Setup') {
        vscode.commands.executeCommand('reviewer.showConnectionHelp');
      } else if (action === 'Use Mock Data') {
        ViewerPanel.createOrShow(context.extensionUri, 'mtcars');
      }
    }
  );

  /**
   * Handle View Data Frame using vscode-r extension
   */
  async function handleViewDataFrameWithVscodeR(ctx: vscode.ExtensionContext): Promise<void> {
    // Check if R terminal is available
    const hasRSession = await vscodeRConnection.isRSessionReady();
    if (!hasRSession) {
      const action = await vscode.window.showWarningMessage(
        'No R terminal found. Start an R session first.',
        'Create R Terminal'
      );
      if (action === 'Create R Terminal') {
        // Try to create R terminal via vscode-r
        vscode.commands.executeCommand('r.createRTerm');
      }
      return;
    }

    // Update status bar to show vscode-r mode is active
    if (rSessionStatusBarItem) {
      rSessionStatusBarItem.text = '$(zap) R Ready';
      rSessionStatusBarItem.tooltip = 'vscode-r detected. Using zero-config mode.';
      rSessionStatusBarItem.backgroundColor = undefined;
    }

    // Initialize R session if needed
    if (!rSessionInitialized) {
      const initialized = await initializeRSession();
      if (!initialized) {
        return;
      }
    }

    // Show input box to enter data frame name
    // (In the future, we could list available data frames, but that requires more complex async handling)
    const dataFrameName = await vscode.window.showInputBox({
      prompt: 'Enter the name of the data frame to view',
      placeHolder: 'e.g., mtcars, iris, df',
      validateInput: (value) => {
        if (!value || value.trim() === '') {
          return 'Please enter a data frame name';
        }
        if (!/^[a-zA-Z_.][a-zA-Z0-9_.]*$/.test(value)) {
          return 'Invalid R variable name';
        }
        return null;
      }
    });

    if (!dataFrameName) {
      return;
    }

    // Use REView() to send data to viewer
    try {
      await vscodeRConnection.sendToViewer(dataFrameName.trim());
      vscode.window.setStatusBarMessage(`Viewing ${dataFrameName}...`, 2000);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to view data frame: ${(error as Error).message}`);
    }
  }

  /**
   * Handle View Data Frame using HTTP connection (manual setup)
   */
  async function handleViewDataFrameWithHttpConnection(ctx: vscode.ExtensionContext): Promise<void> {
    try {
      const dataFrames = await dataProvider.listDataFrames();

      if (dataFrames.length === 0) {
        vscode.window.showInformationMessage(
          'No data frames found in R environment. Load some data first.'
        );
        return;
      }

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
        ViewerPanel.createOrShow(ctx.extensionUri, selected.label);
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to list data frames: ${(error as Error).message}`
      );
    }
  }

  /**
   * Handle View Data Frame with mock data
   */
  async function handleViewDataFrameWithMock(ctx: vscode.ExtensionContext): Promise<void> {
    const dataFrames = await dataProvider.listDataFrames();
    
    const items = dataFrames.map((df) => ({
      label: df.name,
      description: `${df.rows} rows × ${df.columns} cols`,
      detail: df.size,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a mock data frame to view',
      matchOnDescription: true,
    });

    if (selected) {
      ViewerPanel.createOrShow(ctx.extensionUri, selected.label);
    }
  }

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

  // Command: Show Connection Help
  const showConnectionHelpCmd = vscode.commands.registerCommand(
    'reviewer.showConnectionHelp',
    async () => {
      const port = httpServer?.getPort() || 8765;
      
      const panel = vscode.window.createWebviewPanel(
        'reviewerConnectionHelp',
        'REViewer: Connect R',
        vscode.ViewColumn.One,
        { enableScripts: false }
      );
      
      panel.webview.html = getConnectionHelpHtml(port);
    }
  );

  context.subscriptions.push(
    viewDataFrameCmd, 
    refreshViewCmd, 
    viewVariableCmd, 
    showServerInfoCmd,
    showConnectionHelpCmd
  );
}

/**
 * Get HTML for connection help webview
 */
function getConnectionHelpHtml(port: number): string {
  const vscodeRStatus = vscodeRAvailable ? 
    '<span style="color: #4caf50;">✓ Installed</span>' : 
    '<span style="color: #ff9800;">Not installed</span>';
    
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: var(--vscode-font-family); padding: 20px; line-height: 1.6; }
    h1 { color: var(--vscode-textLink-foreground); }
    code { background: var(--vscode-textBlockQuote-background); padding: 2px 6px; border-radius: 3px; }
    pre { background: var(--vscode-textBlockQuote-background); padding: 15px; border-radius: 5px; overflow-x: auto; }
    .method { margin: 20px 0; padding: 15px; border-left: 3px solid var(--vscode-textLink-foreground); }
    .method h2 { margin-top: 0; }
    .recommended { border-left-color: #4caf50; }
    .badge { background: #4caf50; color: white; padding: 2px 8px; border-radius: 3px; font-size: 11px; margin-left: 8px; }
  </style>
</head>
<body>
  <h1>How to View R Data in REViewer</h1>
  
  <div class="method recommended">
    <h2>Method 1: vscode-r Extension (Zero Config) <span class="badge">RECOMMENDED</span></h2>
    <p>Status: ${vscodeRStatus}</p>
    <p>Install the <strong>R Extension for Visual Studio Code</strong> (REditorSupport.r) for the best experience:</p>
    <ol>
      <li>Install vscode-r: <code>Cmd+Shift+X</code> → Search "R" → Install "R Extension for Visual Studio Code"</li>
      <li>Start R terminal: <code>Cmd+Shift+P</code> → "R: Create R Terminal"</li>
      <li>View data: <code>Cmd+Shift+P</code> → "REViewer: View Data Frame" → Enter variable name</li>
    </ol>
    <p><em>With vscode-r installed, REViewer automatically connects to your R session!</em></p>
  </div>
  
  <div class="method">
    <h2>Method 2: REView() Function</h2>
    <p>Directly send a data frame from R to VS Code:</p>
    <pre>
# Source the REView function (one time)
source("path/to/r-package/REView_quick.R")

# View any data frame
REView(mtcars)
REView(iris)
df %>% REView()
    </pre>
  </div>
  
  <div class="method">
    <h2>Method 3: Manual HTTP Connection</h2>
    <p>For advanced users who want to list data frames from command palette:</p>
    <pre>
# Source the service functions
source("r-package/R/reviewer_service.R")

# Connect to VS Code
reviewer_connect(port = ${port})

# Now Cmd+Shift+P → "REViewer: View Data Frame"
# will show a list of available data frames
    </pre>
  </div>
  
  <div class="method">
    <h2>Server Status</h2>
    <p>REViewer HTTP server: <strong>port ${port}</strong></p>
    <p>vscode-r extension: ${vscodeRStatus}</p>
  </div>
</body>
</html>`;
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

