# Test file for SonarLint Terraform rules

# Rule: Hardcoded credentials (should trigger S6381)
provider "aws" {
  region     = "us-east-1"
  access_key = "AKIAIOSFODNN7EXAMPLE"                     # Hardcoded AWS access key
  secret_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" # Hardcoded secret
}

# Rule: Insecure S3 bucket (should trigger S6249, S6250)
resource "aws_s3_bucket" "bad_bucket" {
  bucket = "my-test-bucket"

  # Missing encryption
  # Missing versioning
  # Missing logging
}

resource "aws_s3_bucket_acl" "bad_acl" {
  bucket = aws_s3_bucket.bad_bucket.id
  acl    = "public-read" # Publicly accessible bucket (should trigger rule)
}

# Rule: Insecure security group (should trigger S6321)
resource "aws_security_group" "bad_sg" {
  name        = "allow_all"
  description = "Allow all inbound traffic"

  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"          # All protocols
    cidr_blocks = ["0.0.0.0/0"] # Open to the world
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Rule: Unencrypted EBS volume (should trigger S6270)
resource "aws_ebs_volume" "unencrypted" {
  availability_zone = "us-east-1a"
  size              = 40
  encrypted         = false # Unencrypted volume
}

# Rule: Insecure RDS instance (should trigger S6303, S6304)
resource "aws_db_instance" "insecure_db" {
  identifier          = "mydb"
  engine              = "mysql"
  engine_version      = "5.7"
  instance_class      = "db.t2.micro"
  allocated_storage   = 20
  username            = "admin"
  password            = "password123" # Hardcoded password
  publicly_accessible = true          # Publicly accessible database
  skip_final_snapshot = true
  storage_encrypted   = false # Unencrypted storage
}

# Rule: Weak SSH key (should trigger issues)
resource "aws_key_pair" "deployer" {
  key_name   = "deployer-key"
  public_key = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQD3F6tyPEFEzV0LX3X8BsXdMsQ..." # Example weak key
}

# Rule: Unused variable (should trigger S1481)
variable "unused_var" {
  description = "This variable is never used"
  type        = string
  default     = "unused"
}

variable "used_var" {
  description = "This variable is used"
  type        = string
  default     = "used"
}

# Rule: Missing description
variable "no_description" {
  type    = string
  default = "test"
}

# Rule: Overly permissive IAM policy (should trigger S6317)
resource "aws_iam_policy" "overly_permissive" {
  name        = "overly_permissive_policy"
  description = "A policy with too many permissions"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "*" # Wildcard action (overly permissive)
        Resource = "*" # Wildcard resource (overly permissive)
      },
    ]
  })
}

# Rule: Unencrypted CloudWatch log group (should trigger S6329)
resource "aws_cloudwatch_log_group" "unencrypted_logs" {
  name              = "/aws/lambda/my-function"
  retention_in_days = 7
  # Missing kms_key_id for encryption
}

# Rule: Insecure API Gateway (should trigger rules)
resource "aws_api_gateway_rest_api" "insecure_api" {
  name        = "InsecureAPI"
  description = "API without proper security"
}

resource "aws_api_gateway_method" "insecure_method" {
  rest_api_id   = aws_api_gateway_rest_api.insecure_api.id
  resource_id   = aws_api_gateway_rest_api.insecure_api.root_resource_id
  http_method   = "ANY"
  authorization = "NONE" # No authorization required
}

# Rule: Output with sensitive data (should trigger S6258)
output "database_password" {
  value = aws_db_instance.insecure_db.password # Exposing sensitive data
}

# Rule: Lambda function without dead letter queue (should trigger rules)
resource "aws_lambda_function" "no_dlq" {
  filename      = "lambda_function_payload.zip"
  function_name = "lambda_without_dlq"
  role          = "arn:aws:iam::123456789012:role/lambda-role"
  handler       = "index.handler"
  runtime       = "nodejs14.x"

  # Missing dead_letter_config
  # Missing tracing_config
}

# Rule: Duplicate resource names (code smell)
resource "aws_s3_bucket" "bucket1" {
  bucket = "same-name-bucket"
}

resource "aws_s3_bucket" "bucket2" {
  bucket = "same-name-bucket" # Duplicate bucket name
}

# Using the variable to avoid unused warning
resource "null_resource" "example" {
  provisioner "local-exec" {
    command = "echo ${var.used_var}"
  }
}
