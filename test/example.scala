package com.example

import scala.collection.mutable.ListBuffer

// Example Scala file with intentional code quality issues for SonarLint testing

object Example {

  // Unused value
  val unusedVal = "never used"

  // Hardcoded credential
  val password = "admin123"

  // Function with too many parameters
  def tooManyParams(a: Int, b: Int, c: Int, d: Int, e: Int, f: Int, g: Int, h: Int): Int = {
    a + b + c + d + e + f + g + h
  }

  // Complex nested conditions
  def complexConditions(value: Int): Unit = {
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
  def emptyExceptionHandler(): Unit = {
    try {
      val result = 10 / 0
    } catch {
      case e: Exception => // TODO: handle exception
    }
  }

  // Null usage (prefer Option)
  def nullReturn(): String = {
    null
  }

  // Unused method
  def unusedMethod(): String = {
    "never called"
  }

  // SQL injection risk
  def unsafeQuery(userInput: String): String = {
    s"SELECT * FROM users WHERE name = '$userInput'"
  }

  // Using mutable collection (prefer immutable)
  def mutableCollection(): ListBuffer[Int] = {
    val buffer = ListBuffer[Int]()
    buffer += 1
    buffer += 2
    buffer
  }

  // Inefficient pattern matching
  def inefficientMatch(value: Any): String = {
    if (value.isInstanceOf[String]) {
      value.asInstanceOf[String]
    } else if (value.isInstanceOf[Int]) {
      value.toString
    } else {
      "unknown"
    }
  }

  // Using var instead of val
  def unnecessaryVar(): Int = {
    var x = 10 // Should be val
    x
  }

  // Comparison to boolean
  def redundantComparison(flag: Boolean): String = {
    if (flag == true) {
      "yes"
    } else if (flag == false) {
      "no"
    } else {
      "unknown"
    }
  }

  def main(args: Array[String]): Unit = {
    println("Example Scala code with issues")
  }
}

class ExampleClass {
  // Public var (bad practice)
  var publicData = "sensitive"

  // Unused private field
  private val unusedField = "never used"

  // Method with high complexity
  def complexMethod(value: Int): Unit = {
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
}
