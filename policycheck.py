#!/bin/bash

ROLE=cselearning-ec2-role

echo "== Attached policies =="
aws iam list-attached-role-policies --role-name "$ROLE" --output table

echo "== Inline policies =="
aws iam list-role-policies --role-name "$ROLE" --output table

echo "== Attached policy documents (S3 only) =="
for ARN in $(aws iam list-attached-role-policies --role-name "$ROLE" --query "AttachedPolicies[].PolicyArn" --output text); do
  VER=$(aws iam get-policy --policy-arn "$ARN" --query "Policy.DefaultVersionId" --output text)
  
  cat << PYTHON_CODE | python3
import json, sys

# 读取JSON输入
data = sys.stdin.read()
j = json.loads(data)

st = j.get('Statement', [])
if isinstance(st, dict): 
    st = [st]

out = []
for s in st:
    a = s.get('Action')
    acts = a if isinstance(a, list) else [a]
    if any(isinstance(x, str) and x.startswith('s3:') for x in acts):
        out.append(s)

if out:
    print(json.dumps(out, indent=2))
else:
    print('')
PYTHON_CODE
done < <(aws iam get-policy-version --policy-arn "$ARN" --version-id "$VER" --query "PolicyVersion.Document" --output json)

echo "== Inline policy documents (S3 only) =="
for NAME in $(aws iam list-role-policies --role-name "$ROLE" --query "PolicyNames[]" --output text); do
  
  cat << PYTHON_CODE | python3
import json, sys

# 读取JSON输入
data = sys.stdin.read()
j = json.loads(data)

st = j.get('Statement', [])
if isinstance(st, dict): 
    st = [st]

out = []
for s in st:
    a = s.get('Action')
    acts = a if isinstance(a, list) else [a]
    if any(isinstance(x, str) and x.startswith('s3:') for x in acts):
        out.append(s)

if out:
    print(json.dumps(out, indent=2))
else:
    print('')
PYTHON_CODE
done < <(aws iam get-role-policy --role-name "$ROLE" --policy-name "$NAME" --query "PolicyDocument" --output json)
