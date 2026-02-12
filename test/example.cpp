#include <iostream>
#include <string>
#include <vector>
#include <memory>

// Example C++ file with intentional code quality issues for SonarLint testing

// Unused namespace
using namespace std;

// Global variable
int global_counter = 0;

// Class with issues
class Example {
private:
    int* raw_pointer; // Should use smart pointer
    string unused_field; // Never used

public:
    // Missing virtual destructor
    ~Example() {
        delete raw_pointer;
    }

    // Constructor doesn't initialize all members
    Example() {
        raw_pointer = new int(42);
    }

    // Method with high complexity
    void complexMethod(int value) {
        if (value > 0) {
            if (value < 10) {
                if (value % 2 == 0) {
                    cout << "Small even positive" << endl;
                } else {
                    cout << "Small odd positive" << endl;
                }
            } else {
                if (value < 100) {
                    cout << "Medium positive" << endl;
                } else {
                    cout << "Large positive" << endl;
                }
            }
        }
    }

    // Unused method
    void unusedMethod() {
        cout << "Never called" << endl;
    }
};

// Function with too many parameters
int tooManyParams(int a, int b, int c, int d, int e, int f, int g, int h) {
    return a + b + c + d + e + f + g + h;
}

// Memory leak
void memoryLeak() {
    int* ptr = new int(10);
    // Never deleted
}

// Null pointer dereference risk
void nullDereference(int* ptr) {
    cout << *ptr << endl; // No null check
}

// Empty catch block
void emptyExceptionHandler() {
    try {
        throw runtime_error("Error");
    } catch (const exception& e) {
        // TODO: handle exception
    }
}

// Inefficient pass by value
void inefficientPass(vector<int> vec) {
    for (auto item : vec) {
        cout << item << endl;
    }
}

// Division by zero risk
int divide(int a, int b) {
    return a / b; // No check for b == 0
}

// Using raw array instead of container
void rawArray() {
    int arr[100];
    arr[150] = 10; // Out of bounds
}

int main() {
    cout << "Example C++ code with issues" << endl;

    Example* obj = new Example();
    obj->complexMethod(5);
    // Object never deleted - memory leak

    memoryLeak();

    return 0;
}
