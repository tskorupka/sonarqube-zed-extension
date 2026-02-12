#include <stdio.h>
#include <string.h>
#include <stdlib.h>

// Example C file with intentional code quality issues for SonarLint testing

// Unused variable
int unused_global = 42;

// Function with too many parameters
int too_many_params(int a, int b, int c, int d, int e, int f, int g, int h) {
    return a + b + c + d + e + f + g + h;
}

// Buffer overflow risk
void unsafe_strcpy(char* dest, const char* src) {
    strcpy(dest, src); // Should use strncpy
}

// Memory leak
void memory_leak() {
    char* buffer = (char*)malloc(100);
    // Memory never freed
}

// Null pointer dereference risk
void null_dereference(int* ptr) {
    printf("%d\n", *ptr); // No null check
}

// Unused function
void unused_function() {
    printf("Never called\n");
}

// Complex nested conditions
void complex_conditions(int value) {
    if (value > 0) {
        if (value < 10) {
            if (value % 2 == 0) {
                printf("Small even positive\n");
            } else {
                printf("Small odd positive\n");
            }
        } else {
            if (value < 100) {
                printf("Medium positive\n");
            } else {
                printf("Large positive\n");
            }
        }
    }
}

// Gets return value not checked
void unchecked_return() {
    char buffer[10];
    gets(buffer); // Dangerous and deprecated
}

// Division by zero risk
int divide(int a, int b) {
    return a / b; // No check for b == 0
}

// Array index out of bounds risk
void array_access(int arr[], int index) {
    printf("%d\n", arr[index]); // No bounds checking
}

int main() {
    printf("Example C code with issues\n");

    // Hardcoded array size
    char small_buffer[10];
    unsafe_strcpy(small_buffer, "This string is way too long for the buffer");

    memory_leak();

    return 0;
}
