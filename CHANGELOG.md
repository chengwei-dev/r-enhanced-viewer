# Changelog

All notable changes to the R Enhanced Viewer (REViewer) extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-12-17

### Added

- **REView() Function**: View any R data frame instantly with `REView(df)` in R console
- **Command Palette Integration**: Use `Cmd+Shift+P` → "REViewer: View Data Frame" to select from R workspace
- **Virtual Scrolling**: Efficiently handle large datasets (100k+ rows) with smooth scrolling
- **Column Sorting**: Click column headers to sort by any column (ascending/descending)
- **Global Search**: Search across all columns with instant filtering
- **Theme Support**: Automatic dark/light theme based on VS Code settings
- **Variable Selector**: Browse and select variables with type indicators, search, and drag-and-drop reordering
- **Column Show/Hide**: Select which columns to display via Variable Selector modal
- **Column Reordering**: Drag and drop columns in Variable Selector to change display order
- **Quick Filter**: Press `E` on any cell to filter by that value; `Shift+E` for OR conditions
- **Frequency Tables**: Press `F` on any cell to view frequency distribution
- **Summary Statistics**: Press `M` on numeric columns to view mean, median, min, max, std dev, and more
- **Multi-Column Sorting**: Hold Shift while clicking column headers to add secondary sort
- **Search Dialog**: Press `Ctrl+F` / `Cmd+F` to search across all columns with match navigation
- **Jump to Row**: Press `Ctrl+G` / `Cmd+G` to jump to a specific row number
- **Keyboard Navigation**: Arrow keys to navigate cells; `Home`/`End` for first/last row
- **Cell Copy**: Double-click any cell to copy its value
- **R Session Connection**: Connect R session for bidirectional communication
- **Status Bar**: Shows REViewer server port and R connection status

### Technical Features

- HTTP server for R communication (default port 8765)
- Support for R data types: numeric, integer, character, factor, logical, Date, POSIXct
- Variable labels display (for SAS-like labeled datasets)
- NA value highlighting
- Modular architecture for easy extension

### R Package Functions

- `REView(df)` - Send data frame to VS Code viewer
- `REView_check()` - Check if REViewer server is running
- `reviewer_connect()` - Connect R session for command palette
- `reviewer_disconnect()` - Disconnect R session
- `reviewer_status()` - Check connection status

## [0.1.7] - 2025-01-07

### Added

- **Per-User Port Isolation**: Each user now gets a unique port (8700-8799) based on their username. This prevents data cross-contamination when multiple users work on shared servers like Posit Workbench.
- **REView_port() function**: New helper function to display your assigned port and configuration instructions.
- **Environment variable override**: Set `REVIEWER_PORT` environment variable to use a custom port.
- **Posit Workbench documentation**: Added setup guide for Positron / Posit Workbench users.

### Security

- Fixed critical bug where data could be sent to wrong user's viewer on shared server environments.

## [0.1.6] - 2025-01-04

### Fixed

- **Variable Selector now shows all columns**: Previously, after applying a selection, reopening the Variable Selector only showed selected columns. Now it always shows all original columns, with selected columns at the top (checked) and unselected columns below (unchecked). Users can easily add back previously deselected columns.
- **Keyboard shortcuts disabled when typing in input fields**: Pressing E/F/M/I keys while typing in search boxes or dialogs no longer triggers quick filter or frequency shortcuts. Escape key and Ctrl/Cmd combos still work as expected.

## [0.1.5] - 2025-01-04

### Added

- **Theme Toggle Button**: Added a light/dark theme toggle button in the toolbar for manual theme switching, useful for IDEs like Positron where automatic theme detection may not work.

## [0.1.1] - 2025-12-21

### Added

- **Security & Compliance Documentation**: Comprehensive security section in README

### Fixed

- Dynamic vscode-r extension detection when "View Data Frame" command is invoked
- REView function now properly available in R global environment after auto-injection
- Improved Variable Selector modal height to display more variables

## [Unreleased]

### Planned

- Export to CSV/Excel
- SDTM/ADaM validation helpers

