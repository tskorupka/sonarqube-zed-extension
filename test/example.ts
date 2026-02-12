// Test file for SonarLint LSP integration
// This file contains intentional code smells and bugs that SonarLint should detect

// 1. Unused variable (should trigger S1481)
function unusedVariable() {
  const unusedVar = "I'm never used";
  console.log("Hello");
}

// 2. Duplicated string literal (should trigger S1192)
function duplicatedStrings() {
  console.log("This is a duplicated string");
  console.log("This is a duplicated string");
  console.log("This is a duplicated string");
  console.log("This is a duplicated string");
}

// 3. Cognitive complexity (should trigger S3776)
function complexFunction(a: number, b: number, c: number) {
  if (a > 0) {
    if (b > 0) {
      if (c > 0) {
        for (let i = 0; i < a; i++) {
          if (i % 2 === 0) {
            for (let j = 0; j < b; j++) {
              if (j % 2 === 0) {
                console.log("Complex");
              }
            }
          }
        }
      }
    }
  }
}

// 4. Empty function (should trigger S1186)
function emptyFunction() {}

// 5. Identical if-then branches (should trigger S1871)
function identicalBranches(x: number) {
  if (x > 0) {
    console.log("positive");
  } else {
    console.log("positive");
  }
}

// 6. Dead store (should trigger S1854)
function deadStore() {
  let x = 10;
  x = 20; // Dead store, value is overwritten
  x = 30;
  return x;
}

// 7. Switch without default (should trigger S131)
function switchWithoutDefault(x: number) {
  switch (x) {
    case 1:
      console.log("one");
      break;
    case 2:
      console.log("two");
      break;
  }
}

// 8. Equality comparison with NaN (should trigger S2688)
function nanComparison(x: number) {
  if (x == NaN) {
    // Should use Number.isNaN()
    console.log("Is NaN");
  }
}

// 9. Double negation (should trigger S1940)
function doubleNegation(x: boolean) {
  return !!x;
}

// 10. Type assertion instead of proper type guard (should trigger warnings)
function typeAssertion(obj: any) {
  const str = obj as string;
  return str.toUpperCase();
}

// 11. Promise not awaited (should trigger S4123)
async function promiseNotAwaited() {
  Promise.resolve("test"); // Promise result is not used
  return "done";
}

// 12. Inconsistent return (should trigger S3801)
function inconsistentReturn(x: number): string | undefined {
  if (x > 0) {
    return "positive";
  }
  // Missing return for other cases
}

// 13. Collection size check before iteration (should trigger S4158)
function unnecessarySizeCheck(arr: number[]) {
  if (arr.length > 0) {
    for (const item of arr) {
      console.log(item);
    }
  }
}

// 14. Hardcoded credentials (should trigger S2068)
const password = "hardcoded_password_123";
const apiKey = "sk_test_1234567890";

// 15. console.log in production code (should trigger S2589 or similar)
function debugLogging(data: any) {
  console.log("Debug:", data);
  console.error("Error:", data);
  console.warn("Warning:", data);
}

// 16. Catch block with empty handler (should trigger S2201)
function emptyCatch() {
  try {
    JSON.parse("invalid json");
  } catch (e) {
    // Empty catch block
  }
}

// 17. Deeply nested ternary (should trigger S3358)
function nestedTernary(x: number) {
  return x > 0 ? "pos" : x < 0 ? "neg" : x === 0 ? "zero" : "unknown";
}

// 18. TODO comment (should trigger S1135)
// TODO: implement this function properly

// 19. Magic numbers (should trigger S109)
function magicNumbers(x: number) {
  return x * 3.14159 + 42 - 1337;
}

// 20. Variable shadowing (should trigger S2814)
const globalVar = "global";
function shadowingVariable() {
  const globalVar = "local"; // Shadows global variable
  console.log(globalVar);
}

export {
  unusedVariable,
  duplicatedStrings,
  complexFunction,
  emptyFunction,
  identicalBranches,
  deadStore,
  switchWithoutDefault,
  nanComparison,
  doubleNegation,
  typeAssertion,
  promiseNotAwaited,
  inconsistentReturn,
  unnecessarySizeCheck,
  password,
  apiKey,
  debugLogging,
  emptyCatch,
  nestedTernary,
  magicNumbers,
  shadowingVariable,
};
