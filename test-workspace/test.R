# Test script for REViewer

# Create test data frame
df <- data.frame(
  name = c("Alice", "Bob", "Charlie", "David", "Eve"),
  age = c(25, 30, 35, 28, 32),
  city = c("NYC", "LA", "SF", "Boston", "Seattle"),
  salary = c(75000, 85000, 95000, 70000, 90000)
)

# Load REViewer functions
source("../r-package/R/REView.R")
source("../r-package/R/reviewer_service.R")

# Method 1: Direct view (always works)
# REView(df)

# Method 2: Connect for command palette
# reviewer_connect()
# Then use Cmd+Shift+P -> "REViewer: View Data Frame"

