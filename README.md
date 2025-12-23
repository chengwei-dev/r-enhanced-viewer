# R Enhanced Viewer (REViewer)

A VS Code / Cursor extension for enhanced data frame viewing, designed specifically for statistical programmers in the pharmaceutical industry.

## Features

- **Enhanced Data Viewing** - View R data frames in a modern spreadsheet-like interface
- **REView() Function** - Type `REView(df)` in R console to instantly view data
- **Global Search** - Press `Ctrl+F` / `Cmd+F` to search across all columns
- **Variable Selector** - Quickly browse and select variables with type indicators and search functionality
- **Multi-Column Sorting** - Click column headers to sort; hold Shift to add secondary sort columns
- **Quick Filter** - Press `E` to filter; `Shift+E` to add AND conditions; `Ctrl/Cmd+click` multi-select + `I` for IN filter (OR conditions)
- **Frequency Tables** - Press `F` on any cell to view frequency distribution
- **Summary Statistics** - Press `M` on numeric columns to view mean, median, min, max, and more
- **Copy Support** - Double-click cells to copy values
- **Keyboard Navigation** - Use arrow keys to navigate cells; `Home`/`End` for first/last row
- **Jump to Row** - Press `Ctrl+G` / `Cmd+G` to jump to a specific row number
- **Clear Filters** - Press `Escape` to clear all filters and close panels

## Quick Start

### Installation

1. Open VS Code / Cursor
2. Go to Extensions (`Cmd+Shift+X` / `Ctrl+Shift+X`)
3. Search for "R Enhanced Viewer" or "REViewer"
4. Click **Install**

### Usage

**Prerequisites:** Install [R Extension for Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=REditorSupport.r) for the best experience.

**Steps:**
1. Start R terminal: `Cmd+Shift+P` → "R: Create R Terminal"
2. Load your data in R (e.g., `data("mtcars")` or load your own dataset)
3. View data: `Cmd+Shift+P` → "REViewer: View Data Frame" → Enter variable name

**Using REView() Function:**

After running "REViewer: View Data Frame" once, the `REView()` function becomes available in your R session:

```r
# View any data frame
REView(mtcars)

# Works with pipes too!
library(dplyr)
iris %>% filter(Species == "setosa") %>% REView()
```

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

### 🏢 Enterprise Deployment

- Install directly from VS Code Extensions panel
- Extension reviewed by Microsoft
- No external network requests - suitable for secure environments

## License

MIT

## Acknowledgments

- Built for statistical programmers transitioning from SAS to R
- Thanks to the R extension team for their work on R support in VS Code

