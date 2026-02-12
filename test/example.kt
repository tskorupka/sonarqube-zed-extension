package com.example

import java.util.*

// Example Kotlin file with intentional code quality issues for SonarLint testing

// Unused property
val unusedGlobal = "never used"

// Hardcoded credential
const val PASSWORD = "admin123"

// Function with too many parameters
fun tooManyParams(a: Int, b: Int, c: Int, d: Int, e: Int, f: Int, g: Int, h: Int): Int {
    return a + b + c + d + e + f + g + h
}

// Complex nested conditions
fun complexConditions(value: Int) {
    if (value > 0) {
        if (value < 10) {
            if (value % 2 == 0) {
                println("Small even positive")
            } else {
                println("Small odd positive")
            }
        } else {
            if (value < 100) {
                println("Medium positive")
            } else {
                println("Large positive")
            }
        }
    } else if (value < 0) {
        if (value > -10) {
            println("Small negative")
        } else {
            println("Large negative")
        }
    }
}

// Empty catch block
fun emptyExceptionHandler() {
    try {
        val result = 10 / 0
    } catch (e: Exception) {
        // TODO: handle exception
    }
}

// Potential null pointer
fun getNullableValue(map: Map<String, String>): String {
    return map["key"]!!.toUpperCase() // Unsafe null assertion
}

// Unused function
fun unusedFunction(): String {
    return "never called"
}

// SQL injection risk
fun unsafeQuery(userInput: String): String {
    return "SELECT * FROM users WHERE name = '$userInput'"
}

// Inefficient string concatenation
fun concatenateInLoop(items: List<String>): String {
    var result = ""
    for (item in items) {
        result = result + item // Should use StringBuilder
    }
    return result
}

class Example {
    // Unused property
    private val unusedField = "never used"

    // Public mutable property (bad practice)
    var publicData = "sensitive"

    // Method with too high complexity
    fun complexMethod(value: Int) {
        if (value > 0) {
            if (value < 10) {
                if (value % 2 == 0) {
                    println("Small even positive")
                } else {
                    println("Small odd positive")
                }
            } else {
                if (value < 100) {
                    println("Medium positive")
                } else {
                    println("Large positive")
                }
            }
        }
    }

    // Unused method
    private fun unusedMethod() {
        println("Never called")
    }
}

// Comparison to boolean literal
fun redundantComparison(flag: Boolean): String {
    return if (flag == true) {
        "yes"
    } else if (flag == false) {
        "no"
    } else {
        "unknown"
    }
}

fun main() {
    println("Example Kotlin code with issues")
}
