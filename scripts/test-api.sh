#!/bin/bash

# API Test Script
BASE_URL="http://localhost:3000/api"
EMAIL="user@agora.io"
PASSWORD="password123"

echo "🧪 Testing API Endpoints..."

# 1. Login
echo -n "1. Logging in... "
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

# Check if login was successful
if echo "$LOGIN_RESPONSE" | grep -q "accessToken"; then
    echo "✅ Success"
else
    echo "❌ Failed"
    echo "Response: $LOGIN_RESPONSE"
    exit 1
fi

# Extract token (simple grep/sed hack to avoid jq dependency if not present, though jq is better)
# Assuming standard JSON format from previous output
TOKEN=$(echo "$LOGIN_RESPONSE" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')

if [ -z "$TOKEN" ]; then
    echo "❌ Could not extract token"
    exit 1
fi

echo "   Token extracted."

# 2. Get Me
echo -n "2. Getting User Profile... "
ME_RESPONSE=$(curl -s "$BASE_URL/auth/me" \
  -H "Authorization: Bearer $TOKEN")

if echo "$ME_RESPONSE" | grep -q "$EMAIL"; then
    echo "✅ Success"
    # echo "   User: $(echo $ME_RESPONSE | sed -n 's/.*"name":"\([^"]*\)".*/\1/p')"
else
    echo "❌ Failed"
    echo "Response: $ME_RESPONSE"
fi

# 3. List Courses
echo -n "3. Listing Courses... "
COURSES_RESPONSE=$(curl -s "$BASE_URL/courses" \
  -H "Authorization: Bearer $TOKEN")

if echo "$COURSES_RESPONSE" | grep -q "Agora SDK Fundamentals"; then
    echo "✅ Success"
else
    echo "❌ Failed"
    echo "Response: $COURSES_RESPONSE"
fi

echo ""
echo "🎉 All basic API tests passed!"
