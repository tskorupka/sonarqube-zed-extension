#!/usr/bin/env python3
"""Example Python file with intentional code quality issues for SonarLint testing"""

import os
import sys
import requests  # Unused import

# Global variable (bad practice)
global_counter = 0

# Function with too many parameters
def complex_function(a, b, c, d, e, f, g, h, i, j):
    return a + b + c + d + e + f + g + h + i + j

# Unused function
def unused_function():
    pass

# Function with too high cognitive complexity
def nested_conditions(value):
    if value > 0:
        if value < 10:
            if value % 2 == 0:
                print("Small even positive")
            else:
                print("Small odd positive")
        else:
            if value < 100:
                print("Medium positive")
            else:
                print("Large positive")
    elif value < 0:
        if value > -10:
            print("Small negative")
        else:
            print("Large negative")

# Hardcoded credential
PASSWORD = "admin123"

# SQL injection risk
def unsafe_query(user_input):
    query = f"SELECT * FROM users WHERE name = '{user_input}'"
    return query

# Empty except block
def empty_exception_handler():
    try:
        result = 10 / 0
    except:
        pass

# Mutable default argument
def append_to_list(item, my_list=[]):
    my_list.append(item)
    return my_list

# Using eval (security risk)
def dangerous_eval(user_code):
    return eval(user_code)

# Bare except
def catch_all():
    try:
        something_risky()
    except:
        print("Error occurred")

# Comparison to True/False
def redundant_comparison(flag):
    if flag == True:
        return "yes"
    elif flag == False:
        return "no"

if __name__ == "__main__":
    print("Example Python code with issues")
