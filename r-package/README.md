# reviewer - R Package for REViewer VS Code Extension

This R package provides the `REView()` function to send data frames to the REViewer VS Code/Cursor extension for enhanced viewing.

## Installation

### Quick Setup (No Package Installation)

Just source the function directly:

```r
# From GitHub:
source("https://raw.githubusercontent.com/YOUR_USERNAME/reviewer/main/r-package/R/REView.R")

# Or copy-paste the function from the VS Code extension:
# Command Palette → "REViewer: Show Server Info & Get R Code" → "Copy R Code"
```

### Package Installation (Optional)

```r
# Install from GitHub
# devtools::install_github("YOUR_USERNAME/reviewer", subdir = "r-package")

# Or install locally
# install.packages("/path/to/r-package", repos = NULL, type = "source")
```

## Requirements

```r
install.packages(c("jsonlite", "httr"))
```

## Usage

### Basic Usage

```r
library(reviewer)  # If installed as package

# View any data frame
REView(mtcars)
REView(iris)

# With custom name
REView(mtcars, name = "Motor Trend Cars Data")
```

### With dplyr Pipes

```r
library(dplyr)

mtcars %>%
  filter(mpg > 20) %>%
  select(mpg, cyl, hp) %>%
  REView()

# Or give it a name
iris %>%
  filter(Species == "setosa") %>%
  REView(name = "Setosa Only")
```

### Check Connection

```r
# Check if REViewer is running
REView_check()
# ✓ REViewer is running on port 8765
```

### Get Setup Code

```r
# Print the setup code for quick copy-paste
REView_code()
```

## Features

- **Automatic Type Detection**: Correctly handles numeric, character, factor, date, and datetime columns
- **Variable Labels**: Supports SAS-style variable labels (common in pharma datasets)
- **Large Datasets**: Efficient JSON serialization for datasets with millions of rows
- **Pipe-Friendly**: Works seamlessly with dplyr/tidyverse pipelines
- **Error Handling**: Clear error messages when VS Code extension is not running

## Configuration

### Port Number

Default port is 8765. To use a different port:

```r
# Set in VS Code settings:
# "reviewer.server.port": 8766

# Then in R:
REView(mtcars, port = 8766)
```

## Troubleshooting

### "REViewer not available"

1. Make sure VS Code/Cursor is open
2. Make sure the REViewer extension is installed and activated
3. Open an R file to activate the extension
4. Check the status bar for "REViewer: 8765" indicator

### Data Not Showing

1. Check VS Code for error messages
2. Try with a smaller dataset first: `REView(head(mtcars))`
3. Verify JSON encoding: `jsonlite::toJSON(head(mtcars))`

## For Pharma Industry Users

This package is designed for statistical programmers working with:
- SDTM (Study Data Tabulation Model)
- ADaM (Analysis Data Model)
- TLF (Tables, Listings, Figures) datasets

Features tailored for pharma:
- Support for variable labels (like SAS)
- Handles large datasets efficiently
- Compatible with haven-imported SAS datasets

```r
# Example with labelled data
library(haven)
adsl <- read_sas("adsl.sas7bdat")
REView(adsl)  # Labels will be shown in column headers
```

## License

MIT






