using System;
using System.Collections.Generic;
using System.Linq;
using System.IO;

// Example C# file with intentional code quality issues for SonarLint testing

namespace Example
{
    class Program
    {
        // Unused field
        private static string unusedField = "never used";

        // Hardcoded credential
        private const string Password = "admin123";

        static void Main(string[] args)
        {
            Console.WriteLine("Example C# code with issues");
        }

        // Method with too high cognitive complexity
        public void ComplexMethod(int value)
        {
            if (value > 0)
            {
                if (value < 10)
                {
                    if (value % 2 == 0)
                    {
                        Console.WriteLine("Small even positive");
                    }
                    else
                    {
                        Console.WriteLine("Small odd positive");
                    }
                }
                else
                {
                    if (value < 100)
                    {
                        Console.WriteLine("Medium positive");
                    }
                    else
                    {
                        Console.WriteLine("Large positive");
                    }
                }
            }
        }

        // Empty catch block
        public void EmptyExceptionHandler()
        {
            try
            {
                int result = 10 / 0;
            }
            catch (Exception ex)
            {
                // TODO: handle exception
            }
        }

        // Potential null reference
        public string GetNullableValue(Dictionary<string, string> dict)
        {
            return dict["key"].ToUpper(); // Potential null reference
        }

        // Method with too many parameters
        public int TooManyParams(int a, int b, int c, int d, int e, int f, int g, int h)
        {
            return a + b + c + d + e + f + g + h;
        }

        // Unused method
        private void UnusedMethod()
        {
            Console.WriteLine("Never called");
        }

        // Inefficient string concatenation
        public string ConcatenateInLoop(List<string> items)
        {
            string result = "";
            foreach (var item in items)
            {
                result = result + item; // Should use StringBuilder
            }
            return result;
        }

        // SQL injection risk
        public string UnsafeQuery(string userInput)
        {
            return $"SELECT * FROM users WHERE name = '{userInput}'";
        }

        // Dispose not called
        public void ResourceLeak()
        {
            var file = File.OpenRead("test.txt");
            // File not disposed
        }

        // Comparison to true
        public string RedundantComparison(bool flag)
        {
            if (flag == true)
            {
                return "yes";
            }
            else if (flag == false)
            {
                return "no";
            }
            return "unknown";
        }
    }
}
