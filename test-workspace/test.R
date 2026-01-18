# Test script for REViewer
library(pharmaverseadam)
# Create test data frame
data("adsl")
data("adae")
data("advs")

View(adae)
REView(adae)
REView(adsl)
REView(advs)

# Load REViewer functions
source("https://raw.githubusercontent.com/chengwei-dev/r-enhanced-viewer/main/r-package/R/REView.R")
REView_port()

# Connect R for Command Palette Access
# source("../r-package/R/reviewer_service.R")
# reviewer_connect(port = 8765)

# Method 1: Direct view (always works)
REView(adae)

# Method 2: Connect for command palette
# reviewer_connect()
# Then use Cmd+Shift+P -> "REViewer: View Data Frame"

