# REView Quick Setup Script for Posit Workbench / Positron
# =========================================================
# Source this file to use REView() without installing the package:
#   source("path/to/REView_quick.R")
#
# Or from GitHub:
#   source("https://raw.githubusercontent.com/chengwei-dev/r-enhanced-viewer/main/r-package/REView_quick.R")
#
# IMPORTANT for Posit Workbench users:
# Each user gets a unique port based on their username to avoid conflicts.
# Run REView_port() to see your assigned port, then configure the same port
# in your Positron REViewer extension settings.

# Check and install dependencies
if (!requireNamespace("jsonlite", quietly = TRUE)) {
  message("Installing jsonlite...")
  install.packages("jsonlite", quiet = TRUE)
}
if (!requireNamespace("httr", quietly = TRUE)) {
  message("Installing httr...")
  install.packages("httr", quiet = TRUE)
}

#' Calculate unique port based on username
#' 
#' Each user gets a port in range 8700-8799 based on their system username.
#' This prevents port conflicts when multiple users are on the same server.
#' 
#' @return Integer port number
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

# Store the calculated port for this session
.REView_user_port <- .REView_calculate_port()

#' Get your REViewer port
#' 
#' Shows the port number assigned to your username.
#' Configure this same port in your Positron/VS Code REViewer extension settings.
#' 
#' @return Integer port number (invisibly)
#' @examples
#' REView_port()  # Shows your assigned port
REView_port <- function() {
  message("Your REViewer port: ", .REView_user_port)
  message("")
  message("To configure in Positron/VS Code:")
  message("  1. Open Settings (Cmd+, or Ctrl+,)")
  message("  2. Search for 'reviewer.server.port'")
  message("  3. Set it to: ", .REView_user_port)
  message("")
  message("Or set environment variable: REVIEWER_PORT=", .REView_user_port)
  invisible(.REView_user_port)
}

#' View Data Frame in VS Code REViewer
#'
#' @param x Data frame to view
#' @param name Optional custom name
#' @param port Server port (default: auto-calculated based on username)
#' @return Invisibly returns input
#' @examples
#' REView(mtcars)
#' iris %>% filter(Species == "setosa") %>% REView()
REView <- function(x, name = NULL, port = .REView_user_port) {
  # Convert to data frame if needed
  if (!is.data.frame(x)) {
    x <- tryCatch(as.data.frame(x), error = function(e) {
      stop("Cannot convert to data frame")
    })
  }

  # Get name
  if (is.null(name)) {
    name <- deparse(substitute(x))
    if (grepl("^\\.", name)) name <- "data"
  }

  # Get column info
  col_types <- sapply(x, function(col) class(col)[1])

  # Prepare data (convert special types)
  x_json <- x
  for (i in seq_along(x_json)) {
    if (is.factor(x_json[[i]])) x_json[[i]] <- as.character(x_json[[i]])
    if (inherits(x_json[[i]], "Date")) x_json[[i]] <- format(x_json[[i]], "%Y-%m-%d")
    if (inherits(x_json[[i]], "POSIXt")) x_json[[i]] <- format(x_json[[i]], "%Y-%m-%d %H:%M:%S")
  }

  # Build payload
  # Convert data frame to list of columns (column-oriented format)
  data_as_columns <- as.list(x_json)
  
  payload <- jsonlite::toJSON(list(
    name = name,
    data = data_as_columns,
    nrow = nrow(x),
    ncol = ncol(x),
    colnames = names(x),
    coltypes = col_types
  ), auto_unbox = TRUE, na = "null")

  # Send to REViewer
  tryCatch({
    response <- httr::POST(
      paste0("http://localhost:", port, "/review"),
      body = payload,
      encode = "json",
      httr::content_type_json(),
      httr::timeout(5)
    )
    if (httr::status_code(response) == 200) {
      message(sprintf("\u2713 REViewer: %s (%d \u00d7 %d) [port %d]", name, nrow(x), ncol(x), port))
    } else {
      warning("REViewer returned error. Is your IDE running with correct port?")
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

#' Check REViewer connection
#' @param port Server port (default: auto-calculated based on username)
REView_check <- function(port = .REView_user_port) {
  tryCatch({
    r <- httr::GET(paste0("http://localhost:", port, "/health"), httr::timeout(2))
    if (httr::status_code(r) == 200) {
      message("\u2713 REViewer is running on port ", port)
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

# Show loaded message with user-specific port
message("")
message("\u2713 REView() loaded for user: ", Sys.info()[["user"]])
message("  Your port: ", .REView_user_port)
message("")
message("  Usage:")
message("    REView(mtcars)     # View data frame")
message("    REView_port()      # Show port configuration")
message("    REView_check()     # Test connection")
message("")
message("  IMPORTANT: Configure the same port (", .REView_user_port, ") in your Positron/VS Code settings!")
