#' REViewer - View Data Frame in VS Code
#'
#' Opens a data frame in the REViewer VS Code extension panel.
#' Provides an enhanced viewing experience similar to SAS VIEWTABLE.
#'
#' @param x A data frame or matrix to view
#' @param name Optional. Custom name for the data frame (defaults to variable name)
#' @param port Port number for REViewer server (default: 8765)
#' @param include_labels Logical. Include variable labels if available (default: TRUE)
#'
#' @return Invisibly returns the input data frame
#'
#' @examples
#' \dontrun{
#' # Basic usage
#' REView(mtcars)
#'
#' # With custom name
#' REView(mtcars, name = "Motor Trend Cars")
#'
#' # In a pipe chain
#' library(dplyr)
#' mtcars %>%
#'   filter(mpg > 20) %>%
#'   REView()
#' }
#'
#' @export
REView <- function(x, name = NULL, port = 8765, include_labels = TRUE) {
  # Validate input
  if (!is.data.frame(x) && !is.matrix(x)) {
    # Try to convert to data frame
    x <- tryCatch(
      as.data.frame(x),
      error = function(e) {
        stop("REView requires a data frame, matrix, or object convertible to data frame")
      }
    )
  }

  # If x is a matrix, convert to data frame
  if (is.matrix(x)) {
    x <- as.data.frame(x)
  }

  # Get variable name if not provided
  if (is.null(name)) {
    name <- deparse(substitute(x))
    # Clean up pipe expressions
    if (grepl("^\\.", name)) {
      name <- "data"
    }
  }

  # Check for required packages
  if (!requireNamespace("jsonlite", quietly = TRUE)) {
    stop("Package 'jsonlite' required. Install with: install.packages('jsonlite')")
  }
  if (!requireNamespace("httr", quietly = TRUE)) {
    stop("Package 'httr' required. Install with: install.packages('httr')")
  }

  # Get column types
  col_types <- sapply(x, function(col) {
    cls <- class(col)
    if (length(cls) > 1) {
      # For multi-class objects (like POSIXct), use the first class
      cls[1]
    } else {
      cls
    }
  })

  # Get column labels if available (common in pharma datasets)
  col_labels <- NULL
  if (include_labels) {
    col_labels <- sapply(names(x), function(nm) {
      lbl <- attr(x[[nm]], "label")
      if (is.null(lbl)) "" else as.character(lbl)
    })
    # Only include if at least one label exists
    if (all(col_labels == "")) {
      col_labels <- NULL
    }
  }

  # Prepare data for JSON serialization
  # Handle special types
  x_json <- x
  for (i in seq_along(x_json)) {
    col <- x_json[[i]]

    # Convert factors to character with level information
    if (is.factor(col)) {
      x_json[[i]] <- as.character(col)
    }

    # Convert dates to ISO format
    if (inherits(col, "Date")) {
      x_json[[i]] <- format(col, "%Y-%m-%d")
    }

    # Convert POSIXct/POSIXlt to ISO format
    if (inherits(col, "POSIXt")) {
      x_json[[i]] <- format(col, "%Y-%m-%d %H:%M:%S")
    }

    # Handle NA values (jsonlite handles this, but be explicit)
    # NA will be converted to null in JSON
  }

  # Build the payload
  # Convert data frame to list of columns (column-oriented format)
  # This ensures jsonlite serializes each column as an array
  data_as_columns <- as.list(x_json)
  
  payload <- list(
    name = name,
    data = data_as_columns,
    nrow = nrow(x),
    ncol = ncol(x),
    colnames = names(x),
    coltypes = col_types
  )

  # Add labels if available
  if (!is.null(col_labels)) {
    payload$labels <- col_labels
  }

  # Convert to JSON
  json_data <- jsonlite::toJSON(payload, auto_unbox = TRUE, na = "null")

  # Send to REViewer
  url <- paste0("http://localhost:", port, "/review")

  tryCatch({
    response <- httr::POST(
      url,
      body = json_data,
      encode = "json",
      httr::content_type_json(),
      httr::timeout(5)
    )

    if (httr::status_code(response) == 200) {
      result <- httr::content(response, "parsed")
      message(sprintf(
        "\u2713 REViewer: %s (%d rows \u00d7 %d cols)",
        name, nrow(x), ncol(x)
      ))
    } else {
      warning(sprintf(
        "REViewer returned status %d. Is VS Code extension running?",
        httr::status_code(response)
      ))
    }
  }, error = function(e) {
    message("\u2717 REViewer not available")
    message("  Make sure:")
    message("  1. VS Code/Cursor is open with REViewer extension")
    message("  2. Extension is activated (open an R file)")
    message(sprintf("  3. Server is running on port %d", port))
    message("\n  Alternative: Use command palette 'REViewer: View Data Frame'")
  })

  invisible(x)
}

#' Check REViewer Connection
#'
#' Tests if the REViewer VS Code extension is running and accessible.
#'
#' @param port Port number for REViewer server (default: 8765)
#'
#' @return Logical. TRUE if REViewer is accessible, FALSE otherwise.
#'
#' @examples
#' \dontrun{
#' if (REView_check()) {
#'   REView(mtcars)
#' }
#' }
#'
#' @export
REView_check <- function(port = 8765) {
  if (!requireNamespace("httr", quietly = TRUE)) {
    message("Package 'httr' required. Install with: install.packages('httr')")
    return(FALSE)
  }

  url <- paste0("http://localhost:", port, "/health")

  tryCatch({
    response <- httr::GET(url, httr::timeout(2))
    if (httr::status_code(response) == 200) {
      result <- httr::content(response, "parsed")
      message(sprintf("\u2713 REViewer is running on port %s", result$port))
      return(TRUE)
    }
    return(FALSE)
  }, error = function(e) {
    message("\u2717 REViewer not accessible")
    return(FALSE)
  })
}

#' Get REView R Code
#'
#' Prints the R code needed to use REView function.
#' Useful for quick copy-paste setup.
#'
#' @param port Port number for REViewer server (default: 8765)
#'
#' @export
REView_code <- function(port = 8765) {
  code <- sprintf('
# REViewer Quick Setup
# ====================

# 1. Install required packages (one time):
install.packages(c("jsonlite", "httr"))

# 2. Source the REView function:
# Option A: From GitHub (recommended)
# source("https://raw.githubusercontent.com/chengwei-dev/r-enhanced-viewer/main/r-package/R/REView.R")

# Option B: Define directly (paste this in R console):
REView <- function(x, name = NULL, port = %d) {
  if (!is.data.frame(x)) x <- as.data.frame(x)
  name <- if (is.null(name)) deparse(substitute(x)) else name

  payload <- jsonlite::toJSON(list(
    name = name,
    data = x,
    nrow = nrow(x),
    ncol = ncol(x),
    colnames = colnames(x),
    coltypes = sapply(x, function(col) class(col)[1])
  ), auto_unbox = TRUE, na = "null")

  tryCatch({
    httr::POST(paste0("http://localhost:", port, "/review"),
               body = payload, encode = "json", httr::timeout(5))
    message("\\u2713 Sent to REViewer: ", name)
  }, error = function(e) message("\\u2717 REViewer not available"))

  invisible(x)
}

# 3. Usage:
REView(mtcars)
iris %%>%% dplyr::filter(Sepal.Length > 5) %%>%% REView()
', port)

  cat(code)
  invisible(code)
}






