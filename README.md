# R Enhanced Viewer (REViewer)

A VS Code / Cursor extension for enhanced data frame viewing, designed specifically for statistical programmers in the pharmaceutical industry.

## Features

- 📊 **Enhanced Data Viewing** - View R data frames in a modern spreadsheet-like interface
- 🚀 **REView() Function** - Type `REView(df)` in R console to instantly view data
- 🔍 **Global Search** - Search across all columns instantly
- ↕️ **Sorting** - Click column headers to sort by any column
- ↔️ **Column Resizing** - Drag column borders to adjust width
- 🎨 **Theme Support** - Automatically adapts to VS Code light/dark themes
- ⚡ **Virtual Scrolling** - Efficiently handles large datasets (100k+ rows)
- 📋 **Copy Support** - Double-click cells to copy values

## Quick Start

### Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Press `F5` in VS Code to run the extension in development mode

### Usage

#### Option 1: Zero-Config with vscode-r (Recommended) 🚀

**Best experience - no R setup required!**

1. Install [R Extension for Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=REditorSupport.r) (vscode-r)
2. Start R terminal: `Cmd+Shift+P` → "R: Create R Terminal"
3. View data: `Cmd+Shift+P` → "REViewer: View Data Frame" → Enter variable name (e.g., `mtcars`)

That's it! REViewer automatically connects to your R session through vscode-r.

#### Option 2: REView() Function

Directly send data frames to the viewer from R:

```r
# One-time setup: Install required packages
install.packages(c("jsonlite", "httr"))

# Source the REView function
source("path/to/r-package/REView_quick.R")

# Now view any data frame instantly!
REView(mtcars)

# Works with pipes too!
library(dplyr)
iris %>% filter(Species == "setosa") %>% REView()
```

#### Option 3: Manual HTTP Connection

For advanced users who want full data frame listing:

```r
# One-time setup
install.packages(c("jsonlite", "httr", "later"))

# Source the service
source("path/to/r-package/R/reviewer_service.R")

# Connect to VS Code
reviewer_connect()
# ✓ Connected to REViewer on port 8765
```

Then in VS Code:
1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run `REViewer: View Data Frame`
3. Select a data frame from the list

## Project Architecture

This extension follows a **modular architecture** designed for easy extension and maintenance:

```
r-enhanced-viewer/
├── src/
│   ├── core/                    # Core infrastructure
│   │   ├── types.ts             # Shared TypeScript types
│   │   ├── eventBus.ts          # Event system for module communication
│   │   ├── moduleRegistry.ts    # Module management system
│   │   ├── httpServer.ts        # HTTP server for R communication
│   │   ├── vscodeRApi.ts        # vscode-r extension integration
│   │   ├── rSession.ts          # R session management
│   │   └── dataProvider.ts      # High-level data operations
│   │
│   ├── modules/                 # Feature modules (pluggable)
│   │   └── viewer/              # Data viewing module
│   │       ├── index.ts         # Module definition
│   │       └── ViewerPanel.ts   # VS Code webview panel
│   │
│   ├── webview/                 # Frontend (React)
│   │   ├── App.tsx              # Main application
│   │   ├── components/          # React components
│   │   ├── hooks/               # Custom hooks
│   │   ├── store/               # State management (Zustand)
│   │   └── styles/              # CSS styles
│   │
│   └── extension.ts             # Extension entry point
│
├── r-package/                   # R package for REView() function
│   ├── R/
│   │   ├── REView.R             # Main REView function
│   │   └── reviewer_service.R   # HTTP connection service
│   └── REView_quick.R           # Quick-load script
│
├── package.json                 # Extension manifest
└── vite.config.ts               # Frontend build config
```

## Module System

### Creating a New Module

1. Create a new folder in `src/modules/`:
   ```
   src/modules/myModule/
   ├── index.ts        # Module definition
   └── components/     # Module-specific components
   ```

2. Implement the `IModule` interface:
   ```typescript
   import { IModule } from '../../core/types';

   export class MyModule implements IModule {
     id = 'myModule';
     name = 'My Module';
     version = '1.0.0';
     enabled = true;

     async activate(): Promise<void> {
       // Initialize module
     }

     async deactivate(): Promise<void> {
       // Cleanup
     }
   }
   ```

3. Register in `src/extension.ts`:
   ```typescript
   import { myModule } from './modules/myModule';
   moduleRegistry.register(myModule);
   ```

### Available Modules

| Module | Status | Description |
|--------|--------|-------------|
| `viewer` | ✅ Active | Core data viewing functionality |
| `filter` | 🚧 Planned | Column-level filtering |
| `statistics` | 🚧 Planned | Summary statistics panel |
| `columnManager` | 🚧 Planned | Column reordering and visibility |
| `export` | 🚧 Planned | Export to CSV/Excel |

## Configuration

Configure the extension via VS Code settings:

```json
{
  "reviewer.viewer.maxRowsInitialLoad": 10000,
  "reviewer.viewer.theme": "auto",
  "reviewer.modules.filter.enabled": true,
  "reviewer.modules.statistics.enabled": true,
  "reviewer.r.timeout": 30000
}
```

## Development

### Prerequisites

- Node.js 18+
- npm or yarn
- VS Code

### Scripts

```bash
# Install dependencies
npm install

# Build everything
npm run build

# Watch mode (for development)
npm run watch

# Run linting
npm run lint

# Format code
npm run format

# Run tests
npm test

# Package extension
npm run package
```

### Tech Stack

**Extension (Backend)**
- TypeScript
- VS Code Extension API
- esbuild (bundler)

**Webview (Frontend)**
- React 18
- TanStack Table (data grid)
- TanStack Virtual (virtualization)
- Zustand (state management)
- Vite (bundler)

## Pharma Industry Features

This extension is designed with pharmaceutical industry needs in mind:

- **SAS-like Labels** - Displays variable labels when available
- **Large Dataset Support** - Handles ADaM datasets with 1M+ rows
- **Data Types** - Clear indication of R data types (numeric, character, factor, etc.)
- **Missing Values** - NA values are clearly highlighted
- **CDISC Ready** - Optimized for SDTM/ADaM data structures

## Security & Compliance

### 🔒 Data Privacy

REViewer is designed with pharmaceutical industry data security requirements in mind:

| Security Feature | Status | Description |
|-----------------|--------|-------------|
| **100% Local Processing** | ✅ | All data remains on your local machine |
| **No External Network Requests** | ✅ | No data is sent to any external servers |
| **No Telemetry** | ✅ | No usage data or analytics collection |
| **No Cloud Dependencies** | ✅ | Works completely offline |
| **Memory-Only Storage** | ✅ | Data exists only in memory during viewing session |

### 🏥 Pharmaceutical Industry Compliance

| Regulation | Status | Notes |
|------------|--------|-------|
| **21 CFR Part 11** | ✅ Compatible | Read-only viewer, does not modify source data |
| **HIPAA** | ✅ Compliant | No PHI data transmission |
| **GDPR** | ✅ Compliant | No personal data collection |
| **GxP** | ✅ Compatible | Suitable for validated environments |

### 🔧 Technical Security Details

- **Localhost Only**: HTTP server binds exclusively to `127.0.0.1` (localhost) - external network cannot access
- **Webview Sandbox**: VS Code Webview runs in isolated browser environment with no filesystem or network access
- **No Persistent Storage**: Data is released from memory when viewer is closed
- **Open Source**: Full source code available for security audits

### 🏢 Enterprise Deployment Options

**Option 1: VS Code Marketplace (Standard)**
- Install directly from VS Code Extensions panel
- Extension reviewed by Microsoft

**Option 2: Offline VSIX Installation (Air-Gapped Environments)**
```bash
# IT department downloads and distributes VSIX file
npx @vscode/vsce package
# Employees install via "Install from VSIX"
```

**Option 3: Internal Security Review**
```bash
# Clone and audit source code
git clone https://github.com/chengwei/r-enhanced-viewer

# Verify no external network calls
grep -r "fetch\|axios\|http.request" src/

# Build internally and distribute
npm install && npm run build
npx @vscode/vsce package
```

## Roadmap

### Phase 1 (Current)
- [x] Basic data frame viewing
- [x] Column sorting
- [x] Virtual scrolling
- [x] Theme support
- [x] Copy to clipboard

### Phase 2
- [ ] Column-level filters
- [ ] Global search
- [ ] Column reordering (drag & drop)
- [ ] Column hiding

### Phase 3
- [ ] Summary statistics panel
- [ ] Frequency tables
- [ ] Export functionality
- [ ] Generate R code

### Phase 4
- [ ] Data comparison (diff view)
- [ ] SDTM/ADaM validation
- [ ] Custom calculations
- [ ] Saved views

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT

## Acknowledgments

- Built for statistical programmers transitioning from SAS to R
- Inspired by SAS VIEWTABLE functionality
- Thanks to the R extension team for their work on R support in VS Code

