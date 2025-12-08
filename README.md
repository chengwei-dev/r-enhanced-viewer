# R Data Explorer

A VS Code / Cursor extension for enhanced data frame viewing, designed specifically for statistical programmers in the pharmaceutical industry.

## Features

- 📊 **Enhanced Data Viewing** - View R data frames in a modern spreadsheet-like interface
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

1. Open an R file in VS Code
2. Load some data in R (e.g., `df <- mtcars`)
3. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
4. Run `R Data Explorer: View Data Frame`
5. Select a data frame from the list

## Project Architecture

This extension follows a **modular architecture** designed for easy extension and maintenance:

```
r-data-explorer/
├── src/
│   ├── core/                    # Core infrastructure
│   │   ├── types.ts             # Shared TypeScript types
│   │   ├── eventBus.ts          # Event system for module communication
│   │   ├── moduleRegistry.ts    # Module management system
│   │   ├── rSession.ts          # R process communication
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
  "rDataExplorer.viewer.maxRowsInitialLoad": 10000,
  "rDataExplorer.viewer.theme": "auto",
  "rDataExplorer.modules.filter.enabled": true,
  "rDataExplorer.modules.statistics.enabled": true,
  "rDataExplorer.r.timeout": 30000
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

