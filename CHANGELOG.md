# Changelog

All notable changes to the R Enhanced Viewer (REViewer) extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-12-17

### Added

- **REView() Function**: View any R data frame instantly with `REView(df)` in R console
- **Command Palette Integration**: Use `Cmd+Shift+P` → "REViewer: View Data Frame" to select from R workspace
- **Virtual Scrolling**: Efficiently handle large datasets (100k+ rows) with smooth scrolling
- **Column Sorting**: Click column headers to sort by any column (ascending/descending)
- **Global Search**: Search across all columns with instant filtering
- **Theme Support**: Automatic dark/light theme based on VS Code settings
- **Column Resizing**: Drag column borders to adjust width
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

## [Unreleased]

### Planned

- Column show/hide management
- Column reordering (drag & drop)
- Export to CSV/Excel
- Summary statistics panel
- Column-level filtering
- SDTM/ADaM validation helpers

