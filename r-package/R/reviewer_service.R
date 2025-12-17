#' REViewer Service - Background Service for VS Code Communication
#'
#' This module provides bidirectional communication between R and VS Code.
#' It allows VS Code to query the R workspace for data frames.
#'
#' @name reviewer_service
#' @docType package
NULL

# Global state for the service
.reviewer_env <- new.env(parent = emptyenv())
.reviewer_env$connected <- FALSE
.reviewer_env$port <- 8765
.reviewer_env$poll_interval <- 1  # seconds
.reviewer_env$stop_flag <- FALSE

#' Connect to REViewer VS Code Extension
#'
#' Establishes a connection to the REViewer extension running in VS Code.
#' This enables the VS Code command palette to list and view data frames.
#'
#' @param port Port number for REViewer server (default: 8765)
#' @param poll_interval Interval in seconds to poll for requests (default: 1)
#' @param background Run polling in background (default: TRUE)
#'
#' @return Invisibly returns TRUE on success
#'
#' @examples
#' \dontrun{
#' # Connect to REViewer
#' reviewer_connect()
#'
#' # Now you can use the VS Code command palette:
#' # Cmd+Shift+P -> "REViewer: View Data Frame"
#'
#' # When done, disconnect
#' reviewer_disconnect()
#' }
#'
#' @export
reviewer_connect <- function(port = 8765, poll_interval = 1, background = TRUE) {
  if (!requireNamespace("httr", quietly = TRUE)) {
    stop("Package 'httr' required. Install with: install.packages('httr')")
  }
  if (!requireNamespace("jsonlite", quietly = TRUE)) {
    stop("Package 'jsonlite' required. Install with: install.packages('jsonlite')")
  }

  .reviewer_env$port <- port
  .reviewer_env$poll_interval <- poll_interval
  .reviewer_env$stop_flag <- FALSE

  # Register with VS Code
  url <- paste0("http://localhost:", port, "/register")
  
  tryCatch({
    response <- httr::POST(
      url,
      body = jsonlite::toJSON(list(
        rVersion = R.version$version.string,
        pid = Sys.getpid()
      ), auto_unbox = TRUE),
      encode = "json",
      httr::content_type_json(),
      httr::timeout(5)
    )

    if (httr::status_code(response) == 200) {
      .reviewer_env$connected <- TRUE
      message("\u2713 Connected to REViewer on port ", port)
      message("  Use Cmd+Shift+P \u2192 'REViewer: View Data Frame' in VS Code")
      
      if (background) {
        message("  Starting background polling...")
        reviewer_poll_background()
      }
      
      invisible(TRUE)
    } else {
      stop("Failed to register with REViewer")
    }
  }, error = function(e) {
    message("\u2717 Failed to connect to REViewer")
    message("  Make sure VS Code is open with REViewer extension active")
    message("  Error: ", e$message)
    invisible(FALSE)
  })
}

#' Disconnect from REViewer
#'
#' Stops the background polling and disconnects from VS Code.
#'
#' @export
reviewer_disconnect <- function() {
  .reviewer_env$stop_flag <- TRUE
  .reviewer_env$connected <- FALSE
  message("\u2713 Disconnected from REViewer")
  invisible(TRUE)
}

#' Check REViewer Connection Status
#'
#' @return Logical indicating if connected
#' @export
reviewer_status <- function() {
  if (!.reviewer_env$connected) {
    message("\u2717 Not connected to REViewer")
    message("  Run: reviewer_connect()")
    return(invisible(FALSE))
  }
  
  # Check if VS Code is still responding
  url <- paste0("http://localhost:", .reviewer_env$port, "/health")
  
  tryCatch({
    response <- httr::GET(url, httr::timeout(2))
    if (httr::status_code(response) == 200) {
      message("\u2713 Connected to REViewer on port ", .reviewer_env$port)
      return(invisible(TRUE))
    }
  }, error = function(e) {
    .reviewer_env$connected <- FALSE
    message("\u2717 Lost connection to REViewer")
    return(invisible(FALSE))
  })
  
  invisible(FALSE)
}

#' Poll for Pending Requests (Background)
#'
#' Internal function to poll VS Code for pending requests.
#' This runs in the background using later package if available,
#' otherwise uses a simple polling loop.
#'
#' @keywords internal
reviewer_poll_background <- function() {
  if (requireNamespace("later", quietly = TRUE)) {
    # Use later package for non-blocking background polling
    poll_once <- function() {
      if (.reviewer_env$stop_flag || !.reviewer_env$connected) {
        return()
      }
      
      reviewer_poll_once()
      
      # Schedule next poll
      later::later(poll_once, .reviewer_env$poll_interval)
    }
    
    poll_once()
    message("  Background polling started (using 'later' package)")
  } else {
    message("  Note: Install 'later' package for better background polling")
    message("  For now, run reviewer_poll() manually or use REView() directly")
  }
}

#' Poll Once for Pending Requests
#'
#' Checks VS Code for any pending requests and handles them.
#'
#' @return Invisibly returns TRUE if a request was handled
#' @export
reviewer_poll <- function() {
  if (!.reviewer_env$connected) {
    return(invisible(FALSE))
  }
  
  reviewer_poll_once()
}

#' Internal: Poll and handle one request
#' @keywords internal
reviewer_poll_once <- function() {
  url <- paste0("http://localhost:", .reviewer_env$port, "/pending")
  
  tryCatch({
    response <- httr::GET(url, httr::timeout(2))
    
    if (httr::status_code(response) != 200) {
      return(invisible(FALSE))
    }
    
    request <- httr::content(response, "parsed", simplifyVector = TRUE)
    
    if (is.null(request$id)) {
      # No pending request
      return(invisible(FALSE))
    }
    
    # Handle the request
    result <- reviewer_handle_request(request)
    
    # Send response back to VS Code
    respond_url <- paste0("http://localhost:", .reviewer_env$port, "/respond/", request$id)
    httr::POST(
      respond_url,
      body = jsonlite::toJSON(list(data = result), auto_unbox = TRUE, na = "null"),
      encode = "json",
      httr::content_type_json(),
      httr::timeout(5)
    )
    
    invisible(TRUE)
  }, error = function(e) {
    # Silently fail - VS Code might not be available
    invisible(FALSE)
  })
}

#' Handle a Request from VS Code
#'
#' @param request The request object from VS Code
#' @return The response data
#' @keywords internal
reviewer_handle_request <- function(request) {
  switch(request$type,
    "listDataFrames" = reviewer_list_dataframes(),
    "getData" = reviewer_get_data(request$params$name),
    list(error = paste("Unknown request type:", request$type))
  )
}

#' List All Data Frames in Global Environment
#'
#' @return List of data frame metadata
#' @keywords internal
reviewer_list_dataframes <- function() {
  # Get all objects in global environment
  all_objects <- ls(envir = .GlobalEnv)
  
  # Filter to data frames
  df_names <- all_objects[sapply(all_objects, function(x) {
    obj <- get(x, envir = .GlobalEnv)
    is.data.frame(obj)
  })]
  
  # Build metadata for each data frame
  result <- lapply(df_names, function(name) {
    df <- get(name, envir = .GlobalEnv)
    list(
      name = name,
      rows = nrow(df),
      columns = ncol(df),
      size = format(object.size(df), units = "auto"),
      columnNames = names(df)
    )
  })
  
  result
}

#' Get Data Frame Data
#'
#' @param name Name of the data frame
#' @return Data frame in JSON-serializable format
#' @keywords internal
reviewer_get_data <- function(name) {
  if (!exists(name, envir = .GlobalEnv)) {
    return(list(error = paste("Data frame not found:", name)))
  }
  
  df <- get(name, envir = .GlobalEnv)
  
  if (!is.data.frame(df)) {
    return(list(error = paste("Object is not a data frame:", name)))
  }
  
  # Prepare data for serialization
  df_prepared <- df
  for (i in seq_along(df_prepared)) {
    col <- df_prepared[[i]]
    if (is.factor(col)) {
      df_prepared[[i]] <- as.character(col)
    } else if (inherits(col, "Date")) {
      df_prepared[[i]] <- format(col, "%Y-%m-%d")
    } else if (inherits(col, "POSIXt")) {
      df_prepared[[i]] <- format(col, "%Y-%m-%d %H:%M:%S")
    }
  }
  
  # Get column types
  col_types <- sapply(df, function(col) class(col)[1])
  
  # Convert to column-oriented format
  data_as_columns <- as.list(df_prepared)
  
  list(
    name = name,
    data = data_as_columns,
    nrow = nrow(df),
    ncol = ncol(df),
    colnames = names(df),
    coltypes = col_types
  )
}

#' Send Heartbeat to VS Code
#'
#' Keeps the connection alive.
#'
#' @keywords internal
reviewer_heartbeat <- function() {
  if (!.reviewer_env$connected) {
    return(invisible(FALSE))
  }
  
  url <- paste0("http://localhost:", .reviewer_env$port, "/heartbeat")
  
  tryCatch({
    httr::POST(url, httr::timeout(2))
    invisible(TRUE)
  }, error = function(e) {
    invisible(FALSE)
  })
}

#' Auto-Connect on Package Load
#'
#' Optionally auto-connect when the package is loaded.
#' Set options(reviewer.autoconnect = TRUE) to enable.
#'
#' @keywords internal
.onLoad <- function(libname, pkgname) {
  if (getOption("reviewer.autoconnect", FALSE)) {
    reviewer_connect()
  }
}

