package main

import (
	"fmt"
	"os"
)

// Example Go file with intentional code quality issues for SonarLint testing

// Unused global variable
var unusedGlobal = "never used"

// Function with too many return values
func tooManyReturns(a, b, c int) (int, int, int, int, int, int) {
	return a, b, c, a + b, b + c, a + b + c
}

// Empty error handling
func emptyErrorHandler() {
	file, err := os.Open("nonexistent.txt")
	if err != nil {
		// TODO: handle error
	}
	defer file.Close()
}

// Hardcoded credential
const password = "admin123"

// Function with high cognitive complexity
func complexConditions(value int) {
	if value > 0 {
		if value < 10 {
			if value%2 == 0 {
				fmt.Println("Small even positive")
			} else {
				fmt.Println("Small odd positive")
			}
		} else {
			if value < 100 {
				fmt.Println("Medium positive")
			} else {
				fmt.Println("Large positive")
			}
		}
	} else if value < 0 {
		if value > -10 {
			fmt.Println("Small negative")
		} else {
			fmt.Println("Large negative")
		}
	}
}

// Unused function
func unusedFunction() string {
	return "never called"
}

// Function with too many parameters
func tooManyParams(a, b, c, d, e, f, g, h int) int {
	return a + b + c + d + e + f + g + h
}

// Inefficient string concatenation in loop
func inefficientConcat(items []string) string {
	result := ""
	for _, item := range items {
		result = result + item // Should use strings.Builder
	}
	return result
}

// Error ignored
func ignoredError() {
	fmt.Printf("This might fail")
}

// Naked return in long function
func nakedReturn() (x, y int) {
	x = 1
	y = 2
	if x > 0 {
		x++
	}
	if y > 0 {
		y++
	}
	return // Naked return in long function
}

func main() {
	fmt.Println("Example Go code with issues")
}
