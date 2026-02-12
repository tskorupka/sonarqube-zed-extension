package com.example;

import java.util.*;
import java.io.*;

// Example Java file with intentional code quality issues for SonarLint testing

public class Example {

    // Unused variable
    private String unusedField = "never used";

    // Method too complex (cognitive complexity)
    public void complexMethod(int value) {
        if (value > 0) {
            if (value < 10) {
                if (value % 2 == 0) {
                    System.out.println("Small even positive");
                } else {
                    System.out.println("Small odd positive");
                }
            } else {
                if (value < 100) {
                    System.out.println("Medium positive");
                } else {
                    System.out.println("Large positive");
                }
            }
        } else if (value < 0) {
            if (value > -10) {
                System.out.println("Small negative");
            } else {
                System.out.println("Large negative");
            }
        }
    }

    // Potential null pointer
    public String getNullableValue(Map<String, String> map) {
        return map.get("key").toUpperCase(); // Potential NPE
    }

    // Empty catch block
    public void emptyExceptionHandler() {
        try {
            int result = 10 / 0;
        } catch (Exception e) {
            // TODO: handle exception
        }
    }

    // Hardcoded credential
    private static final String PASSWORD = "admin123";

    // SQL injection risk
    public void unsafeQuery(String userInput) {
        String query = "SELECT * FROM users WHERE name = '" + userInput + "'";
    }

    // Inefficient code
    public String concatenateInLoop(List<String> items) {
        String result = "";
        for (String item : items) {
            result = result + item; // Should use StringBuilder
        }
        return result;
    }
}
