# Test script for REViewer
library(pharmaverseadam)
# Create test data frame
data("adae")

# Load REViewer functions
source("../r-package/R/REView.R")
source("../r-package/R/reviewer_service.R")

# Method 1: Direct view (always works)
REView(adae)

# Method 2: Connect for command palette
# reviewer_connect()
# Then use Cmd+Shift+P -> "REViewer: View Data Frame"

