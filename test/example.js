// Test file for SonarLint LSP integration
// This file contains intentional code issues to trigger SonarLint diagnostics

// 1. Unused variable (should trigger S1481)
function unusedVariable() {
  var x = 10; // x is never used
  return 5;
}

// 2. Console.log usage (should trigger S2228)
function debugLogging() {
  console.log("This should be removed in production");
  return true;
}

// 3. == instead of === (should trigger S1221)
function looseEquality(value) {
  if (value == null) {
    // Should use ===
    return false;
  }
  return true;
}

// 4. Duplicated code
function duplicatedCode1() {
  const a = 1;
  const b = 2;
  const c = 3;
  return a + b + c;
}

function duplicatedCode2() {
  const a = 1;
  const b = 2;
  const c = 3;
  return a + b + c;
}

// 5. Empty catch block (should trigger S2486)
function emptyCatchBlock() {
  try {
    throw new Error("test");
  } catch (e) {
    // Empty catch - should be flagged
  }
}

// 6. Function with too many parameters (should trigger S107)
function tooManyParameters(a, b, c, d, e, f, g, h, i, j) {
  return a + b + c + d + e + f + g + h + i + j;
}

// 7. Cognitive complexity (nested conditions)
function highComplexity(x, y, z) {
  if (x > 0) {
    if (y > 0) {
      if (z > 0) {
        for (let i = 0; i < 10; i++) {
          if (i % 2 == 0) {
            console.log(i);
          }
        }
      }
    }
  }
}

// 8. Variable shadowing (should trigger S2814)
var globalVar = "global";

function shadowingVariable() {
  var globalVar = "local"; // Shadows global variable
  return globalVar;
}

// 9. Switch without default (should trigger S131)
function switchWithoutDefault(value) {
  switch (value) {
    case 1:
      return "one";
    case 2:
      return "two";
    // Missing default case
  }
}

// 10. Function returning different types (should trigger S3800)
function inconsistentReturn(flag) {
  if (flag) {
    return "string";
  } else {
    return 123; // Returns number
  }
}

// 11. Identical expressions on both sides of operator (should trigger S1764)
function identicalExpressions(x) {
  if (x == x) {
    // Identical operands
    return true;
  }
  return false;
}

// 12. Regular expression with potential issues
function regexIssue() {
  const pattern = /^.*$/; // Overly permissive regex
  return pattern.test("anything");
}

// 13. TODO comment (should trigger S1135)
function todoComment() {
  // TODO: implement this function properly
  return null;
}

// 14. Magic numbers (should trigger S109)
function magicNumbers() {
  const area = 3.14159 * 10 * 10; // Magic numbers
  return area;
}

// 15. Callback without error handling
function callbackWithoutErrorHandling(callback) {
  setTimeout(callback, 1000); // No error handling
}

// Export to avoid "no-exports" warnings
module.exports = {
  unusedVariable,
  debugLogging,
  looseEquality,
  duplicatedCode1,
  duplicatedCode2,
  emptyCatchBlock,
  tooManyParameters,
  highComplexity,
  shadowingVariable,
  switchWithoutDefault,
  inconsistentReturn,
  identicalExpressions,
  regexIssue,
  todoComment,
  magicNumbers,
  callbackWithoutErrorHandling,
};
