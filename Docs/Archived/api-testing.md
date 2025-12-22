# 🧪 API Testing Guide

This document provides commands to test all implemented API endpoints.

## Prerequisites

1. ✅ Database configured and migrated
2. ✅ Environment variables set
3. ✅ Development server running (`npm run dev`)

## Base URL
```
http://localhost:3000
```

## Authentication Flow

### 1. Register a New User

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@agora.io",
    "password": "password123",
    "name": "Test User",
    "department": "Engineering"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "testuser@agora.io",
      "name": "Test User",
      "role": "USER"
    },
    "session": {
      "accessToken": "eyJ...",
      "refreshToken": "...",
      "expiresIn": 3600
    }
  }
}
```

**Save the `accessToken` for authenticated requests!**

### 2. Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@agora.io",
    "password": "password123"
  }'
```

### 3. Get Current User (Authenticated)

```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Course APIs

### 4. List All Courses (Public)

```bash
curl http://localhost:3000/api/courses
```

**With Pagination and Filters:**
```bash
curl "http://localhost:3000/api/courses?page=1&limit=5&category=SDK%20Integration&level=BEGINNER"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "courses": [...],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 3,
      "totalPages": 1
    }
  }
}
```

### 5. Get Course Details (Public)

```bash
# Replace COURSE_ID with actual ID from list
curl http://localhost:3000/api/courses/COURSE_ID
```

### 6. Enroll in Course (Authenticated)

```bash
curl -X POST http://localhost:3000/api/courses/COURSE_ID/enroll \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "enrollment": {
      "id": "uuid",
      "userId": "uuid",
      "courseId": "uuid",
      "status": "ACTIVE",
      "progress": 0
    }
  },
  "message": "Successfully enrolled in course"
}
```

## Progress Tracking

### 7. Update Lesson Progress (Authenticated)

```bash
curl -X POST http://localhost:3000/api/progress/lessons/LESSON_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "watchedDuration": 300,
    "lastTimestamp": 300,
    "completed": false
  }'
```

### 8. Get Course Progress (Authenticated)

```bash
curl http://localhost:3000/api/progress/courses/COURSE_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "courseId": "uuid",
    "overallProgress": 25,
    "completedLessons": 1,
    "totalLessons": 4,
    "lessonProgress": [...],
    "enrollment": {...}
  }
}
```

## AI Assistant

### 9. Create AI Conversation (Authenticated)

```bash
curl -X POST http://localhost:3000/api/ai/conversations \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "courseId": "COURSE_ID",
    "lessonId": "LESSON_ID"
  }'
```

**Save the `conversation.id` for chat!**

### 10. Send Message to AI (Authenticated)

```bash
curl -X POST http://localhost:3000/api/ai/conversations/CONVERSATION_ID/messages \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Can you explain what Agora SDK is?",
    "videoTimestamp": 120
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "userMessage": {...},
    "assistantMessage": {
      "content": "I understand you're asking about...",
      "role": "assistant"
    },
    "suggestions": [
      "Can you explain this concept further?",
      "What are some practical examples?"
    ]
  }
}
```

### 11. Get Conversation History (Authenticated)

```bash
curl http://localhost:3000/api/ai/conversations/CONVERSATION_ID/messages \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Testing Workflow Example

Here's a complete workflow to test the system:

```bash
# 1. Register
REGISTER_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@agora.io","password":"demo123","name":"Demo User"}')

# Extract token (using jq if available)
TOKEN=$(echo $REGISTER_RESPONSE | jq -r '.data.session.accessToken')

# 2. Get courses
COURSES=$(curl -s http://localhost:3000/api/courses)
COURSE_ID=$(echo $COURSES | jq -r '.data.courses[0].id')

# 3. Enroll
curl -X POST "http://localhost:3000/api/courses/$COURSE_ID/enroll" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"

# 4. Get course details
curl -s "http://localhost:3000/api/courses/$COURSE_ID" \
  -H "Authorization: Bearer $TOKEN" | jq

# 5. Create AI conversation
CONV_RESPONSE=$(curl -s -X POST http://localhost:3000/api/ai/conversations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"courseId\":\"$COURSE_ID\"}")

CONV_ID=$(echo $CONV_RESPONSE | jq -r '.data.conversation.id')

# 6. Chat with AI
curl -X POST "http://localhost:3000/api/ai/conversations/$CONV_ID/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"What is this course about?"}' | jq
```

## Error Testing

### Test Invalid Credentials
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"wrong@email.com","password":"wrong"}'
```

**Expected:**
```json
{
  "success": false,
  "error": {
    "code": "AUTH_005",
    "message": "Invalid email or password"
  }
}
```

### Test Unauthenticated Access
```bash
curl http://localhost:3000/api/auth/me
```

**Expected:**
```json
{
  "success": false,
  "error": {
    "code": "AUTH_001",
    "message": "No authentication token provided"
  }
}
```

### Test Duplicate Registration
```bash
# Try to register same email twice
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@agora.io","password":"pass123","name":"Test"}'
```

**Expected:**
```json
{
  "success": false,
  "error": {
    "code": "AUTH_004",
    "message": "Email already registered"
  }
}
```

## Using Postman

If you prefer a GUI, import these as a Postman collection:

1. Create new collection "CSE Training LMS"
2. Add environment variables:
   - `baseUrl`: `http://localhost:3000`
   - `accessToken`: (will be set after login)
3. Add requests as documented above
4. Use `{{baseUrl}}` and `{{accessToken}}` variables

## Health Check

```bash
# Check if server is running
curl http://localhost:3000/api/health || echo "Server not responding"
```

## Troubleshooting

### "Cannot find module '@prisma/client'"
```bash
npm run prisma:generate
```

### "Database connection failed"
- Check DATABASE_URL in .env
- Ensure Supabase project is accessible
- Verify connection string format

### "No courses returned"
```bash
npm run prisma:seed
```

### TypeScript errors
```bash
npm install
npm run prisma:generate
```

## Success Criteria

✅ User registration works  
✅ Login returns valid JWT  
✅ Course listing returns seeded data  
✅ Enrollment creates database record  
✅ Progress tracking updates correctly  
✅ AI conversation can be created  
✅ AI responds to messages (mock response)  
✅ Error responses have correct format  

## Next Steps After Testing

Once all tests pass:
1. ✅ Frontend can integrate with real APIs
2. ✅ Connect real AI provider (OpenAI/Anthropic)
3. ✅ Add remaining endpoints (quizzes, admin)
4. ✅ Deploy to production
