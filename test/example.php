<?php
// Example PHP file with intentional code quality issues for SonarLint testing

// Hardcoded credential
$password = "admin123";

// SQL injection risk
function unsafeQuery($userInput) {
    $query = "SELECT * FROM users WHERE name = '" . $userInput . "'";
    return $query;
}

// XSS vulnerability
function unsafeOutput($userInput) {
    echo "<div>" . $userInput . "</div>";
}

// Empty catch block
function emptyExceptionHandler() {
    try {
        $result = 10 / 0;
    } catch (Exception $e) {
        // TODO: handle exception
    }
}

// Too many nested levels
function deeplyNested($value) {
    if ($value > 0) {
        if ($value < 10) {
            if ($value % 2 == 0) {
                echo "Small even positive";
            } else {
                echo "Small odd positive";
            }
        } else {
            if ($value < 100) {
                echo "Medium positive";
            } else {
                echo "Large positive";
            }
        }
    }
}

// Unused variable
$unusedVar = "never used";

// Function with too many parameters
function tooManyParams($a, $b, $c, $d, $e, $f, $g, $h) {
    return $a + $b + $c + $d + $e + $f + $g + $h;
}

// eval usage (security risk)
function dangerousEval($code) {
    return eval($code);
}

// Weak hash
function weakHash($password) {
    return md5($password);
}

// File inclusion risk
function includeUserFile($filename) {
    include($filename);
}

class Example {
    // Public property (should be private)
    public $publicData = "sensitive";

    // Unused method
    private function unusedMethod() {
        return "never called";
    }
}

?>
