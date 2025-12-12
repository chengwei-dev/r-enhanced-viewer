# REView Quick Setup Script
# =========================
# Source this file to use REView() without installing the package:
#   source("path/to/REView_quick.R")
#
# Or from GitHub:
#   source("https://raw.githubusercontent.com/YOUR_USERNAME/reviewer/main/r-package/REView_quick.R")

# Check and install dependencies
if (!requireNamespace("jsonlite", quietly = TRUE)) {
  message("Installing jsonlite...")
  install.packages("jsonlite", quiet = TRUE)
}
if (!requireNamespace("httr", quietly = TRUE)) {
  message("Installing httr...")
  install.packages("httr", quiet = TRUE)
}

#' View Data Frame in VS Code REViewer
#'
#' @param x Data frame to view
#' @param name Optional custom name
#' @param port Server port (default: 8765)
#' @return Invisibly returns input
#' @examples
#' REView(mtcars)
#' iris %>% filter(Species == "setosa") %>% REView()
REView <- function(x, name = NULL, port = 8765) {
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
  payload <- jsonlite::toJSON(list(
    name = name,
    data = x_json,
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
      message(sprintf("\u2713 REViewer: %s (%d \u00d7 %d)", name, nrow(x), ncol(x)))
    } else {
      warning("REViewer returned error. Is VS Code running?")
    }
  }, error = function(e) {
    message("\u2717 REViewer not available")
    message("  Ensure VS Code is open with REViewer extension active")
  })

  invisible(x)
}

#' Check REViewer connection
REView_check <- function(port = 8765) {
  tryCatch({
    r <- httr::GET(paste0("http://localhost:", port, "/health"), httr::timeout(2))
    if (httr::status_code(r) == 200) {
      message("\u2713 REViewer is running on port ", port)
      return(TRUE)
    }
    return(FALSE)
  }, error = function(e) {
    message("\u2717 REViewer not accessible")
    return(FALSE)
  })
}

message("\u2713 REView() function loaded")
message("  Usage: REView(mtcars)")
message("  Check: REView_check()")

