#' REViewer - View Data Frame in VS Code
#'
#' Opens a data frame in the REViewer VS Code extension panel.
#' Provides an enhanced viewing experience similar to SAS VIEWTABLE.
#'
#' For Posit Workbench / Positron users:
#' Each user gets a unique port based on their username to avoid conflicts.
#' Run REView_port() to see your assigned port, then configure the same port
#' in your Positron REViewer extension settings.
#'
#' @param x A data frame or matrix to view
#' @param name Optional. Custom name for the data frame (defaults to variable name)
#' @param port Port number for REViewer server (default: auto-calculated based on username)
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
#'
#' # Check your assigned port (for Posit Workbench)
#' REView_port()
#' }
#'
#' @export
REView <- function(x, name = NULL, port = NULL, include_labels = TRUE) {
  # Use auto-calculated port if not specified
  if (is.null(port)) {
    port <- .REView_get_port()
  }
  
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
        "\u2713 REViewer: %s (%d rows \u00d7 %d cols) [port %d]",
        name, nrow(x), ncol(x), port
      ))
    } else {
      warning(sprintf(
        "REViewer returned status %d. Is your IDE running with correct port?",
        httr::status_code(response)
      ))
    }
  }, error = function(e) {
    message("\u2717 REViewer not available on port ", port)
    message("")
    message("  For Posit Workbench / Positron users:")
    message("  1. Run REView_port() to see your assigned port")
    message("  2. Configure the same port in Positron: Settings > reviewer.server.port")
    message("  3. Set up port forwarding from server to your local machine")
    message("")
    message("  For VS Code / Cursor users:")
    message("  Use Command Palette > 'REViewer: View Data Frame' instead")
  })

  invisible(x)
}

#' Calculate unique port based on username
#' 
#' Each user gets a port in range 8700-8799 based on their system username.
#' This prevents port conflicts when multiple users are on the same server.
#' 
#' @return Integer port number
#' @keywords internal
.REView_calculate_port <- function() {
  # Check for environment variable override first
  env_port <- Sys.getenv("REVIEWER_PORT", unset = "")
  if (nzchar(env_port)) {
    port <- as.integer(env_port)
    if (!is.na(port) && port > 1024 && port < 65535) {
      return(port)
    }
  }
  
  # Calculate port based on username
  username <- Sys.info()[["user"]]
  if (is.null(username) || username == "") {
    username <- Sys.getenv("USER", unset = Sys.getenv("USERNAME", unset = "default"))
  }
  
  # Simple hash: sum of character codes modulo 100
  char_codes <- utf8ToInt(username)
  hash_value <- sum(char_codes) %% 100
  
  # Port range: 8700-8799
  port <- 8700 + hash_value
  return(port)
}

#' Get the REViewer port for current user
#' @return Integer port number
#' @keywords internal
.REView_get_port <- function() {
  # Check if port is cached in package environment
  if (exists(".REView_cached_port", envir = .GlobalEnv)) {
    return(get(".REView_cached_port", envir = .GlobalEnv))
  }
  
  port <- .REView_calculate_port()
  assign(".REView_cached_port", port, envir = .GlobalEnv)
  return(port)
}

#' Get your REViewer port
#' 
#' Shows the port number assigned to your username.
#' Configure this same port in your Positron/VS Code REViewer extension settings.
#' 
#' @return Integer port number (invisibly)
#' @examples
#' \dontrun{
#' REView_port()  # Shows your assigned port
#' }
#' @export
REView_port <- function() {
  port <- .REView_get_port()
  username <- Sys.info()[["user"]]
  
  message("REViewer Port Configuration")
  message("===========================")
  message("Username: ", username)
  message("Assigned port: ", port)
  message("")
  message("To configure in Positron/VS Code:")
  message("  1. Open Settings (Cmd+, or Ctrl+,)")
  message("  2. Search for 'reviewer.server.port'")
  message("  3. Set it to: ", port)
  message("")
  message("Or set environment variable before starting R:")
  message("  export REVIEWER_PORT=", port)
  
  invisible(port)
}

#' Check REViewer Connection
#'
#' Tests if the REViewer VS Code extension is running and accessible.
#'
#' @param port Port number for REViewer server (default: auto-calculated based on username)
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
REView_check <- function(port = NULL) {
  if (is.null(port)) {
    port <- .REView_get_port()
  }
  
  if (!requireNamespace("httr", quietly = TRUE)) {
    message("Package 'httr' required. Install with: install.packages('httr')")
    return(invisible(FALSE))
  }

  url <- paste0("http://localhost:", port, "/health")

  tryCatch({
    response <- httr::GET(url, httr::timeout(2))
    if (httr::status_code(response) == 200) {
      result <- httr::content(response, "parsed")
      message(sprintf("\u2713 REViewer is running on port %d", port))
      return(invisible(TRUE))
    }
    message("\u2717 REViewer not responding on port ", port)
    return(invisible(FALSE))
  }, error = function(e) {
    message("\u2717 REViewer not accessible on port ", port)
    message("  Run REView_port() to check your configuration")
    return(invisible(FALSE))
  })
}

#' Get REView R Code
#'
#' Prints the R code needed to use REView function.
#' Useful for quick copy-paste setup.
#'
#' @param port Port number for REViewer server (default: auto-calculated)
#'
#' @export
REView_code <- function(port = NULL) {
  if (is.null(port)) {
    port <- .REView_get_port()
  }
  
  code <- sprintf('
# REViewer Quick Setup
# ====================

# 1. Install required packages (one time):
install.packages(c("jsonlite", "httr"))

# 2. Source the REView function:
# Option A: From GitHub (recommended)
source("https://raw.githubusercontent.com/chengwei-dev/r-enhanced-viewer/main/r-package/REView_quick.R")

# 3. Check your assigned port:
REView_port()  # Note this port number!

# 4. Configure the SAME port in your IDE:
#    Settings > reviewer.server.port > %d

# 5. Usage:
REView(mtcars)
iris %%>%% dplyr::filter(Sepal.Length > 5) %%>%% REView()
', port)

  cat(code)
  invisible(code)
}
