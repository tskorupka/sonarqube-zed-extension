#!/usr/bin/env ruby
# Example Ruby file with intentional code quality issues for SonarLint testing

# Unused constant
UNUSED_CONSTANT = "never used"

# Hardcoded credential
PASSWORD = "admin123"

# Method with too many parameters
def too_many_params(a, b, c, d, e, f, g, h)
  a + b + c + d + e + f + g + h
end

# Complex nested conditions
def complex_conditions(value)
  if value > 0
    if value < 10
      if value.even?
        puts "Small even positive"
      else
        puts "Small odd positive"
      end
    else
      if value < 100
        puts "Medium positive"
      else
        puts "Large positive"
      end
    end
  elsif value < 0
    if value > -10
      puts "Small negative"
    else
      puts "Large negative"
    end
  end
end

# Empty rescue block
def empty_exception_handler
  result = 10 / 0
rescue
  # TODO: handle exception
end

# SQL injection risk
def unsafe_query(user_input)
  query = "SELECT * FROM users WHERE name = '#{user_input}'"
  query
end

# Unused method
def unused_method
  puts "Never called"
end

# Method too long
def long_method
  puts "Line 1"
  puts "Line 2"
  puts "Line 3"
  puts "Line 4"
  puts "Line 5"
  puts "Line 6"
  puts "Line 7"
  puts "Line 8"
  puts "Line 9"
  puts "Line 10"
  puts "Line 11"
  puts "Line 12"
  puts "Line 13"
  puts "Line 14"
  puts "Line 15"
end

# Class with issues
class Example
  # Public attribute (should use attr_accessor)
  attr_accessor :public_data

  def initialize
    @public_data = "sensitive"
    @unused_var = "never used"
  end

  # Method with no meaningful implementation
  def useless_method
    true
  end

  # Comparison to true/false
  def redundant_comparison(flag)
    if flag == true
      "yes"
    elsif flag == false
      "no"
    end
  end
end

# eval usage (security risk)
def dangerous_eval(code)
  eval(code)
end

# Nested ternary (hard to read)
def nested_ternary(a, b, c)
  a > b ? (b > c ? a : c) : (a > c ? b : c)
end

# Global variable
$global_counter = 0

puts "Example Ruby code with issues" if __FILE__ == $PROGRAM_NAME
