# Optional RAG Service Setup

## Overview

The backend now supports running with or without the SmartApp_Clone RAG service. This allows you to:
- Run the backend independently (useful for development or when RAG service is not needed)
- Gitignore the SmartApp_Clone folder without breaking the backend
- See clear UI feedback when the AI service is unavailable

## Running the Backend

### Option 1: Start Backend with RAG Service (if available)
```bash
npm start
# or
npm run start
```

This will:
- Check if `SmartApp_Clone/rag_service` directory exists
- If it exists, start the RAG service first, then the backend
- If it doesn't exist, start only the backend with a warning message
- Backend will continue running even if RAG service fails to start

### Option 2: Start Backend Only (No RAG Service)
```bash
npm run start:backend-only
# or
npm run start:backend
```

This will:
- Start only the backend server
- Skip RAG service entirely
- AI features will be unavailable

## Frontend Behavior

### When RAG Service is Available
- Users can send AI queries normally
- Responses are generated using the RAG service

### When RAG Service is Unavailable
- A warning banner appears at the top: **"Service not available - Unable to send messages"**
- Input field is disabled and shows placeholder: "Service unavailable..."
- Send button is disabled
- Users cannot send messages until service is restored

## Error Handling

The backend gracefully handles RAG service unavailability:
- Returns HTTP 503 status with `serviceUnavailable: true` flag
- Frontend detects this and shows the unavailable banner
- No crashes or errors - backend continues running normally

## Files Modified

1. **backend/start-services.js**
   - Made RAG service directory check optional
   - Backend starts even if RAG service directory doesn't exist
   - Warning messages instead of errors when RAG is unavailable

2. **backend/package.json**
   - Added `start:backend-only` script for running without RAG

3. **backend/src/routes/ai.js**
   - Enhanced error handling to return `serviceUnavailable: true` flag
   - Better error messages for service unavailability

4. **frontend/app/(tabs)/AI.tsx**
   - Added service availability state tracking
   - Warning banner when service is unavailable
   - Disabled input and send button when service unavailable
   - Automatic detection on first query attempt

## Testing

### Test 1: With RAG Service
1. Ensure `SmartApp_Clone/rag_service` exists
2. Run `npm start`
3. Verify both services start
4. Test AI queries in frontend

### Test 2: Without RAG Service
1. Rename or remove `SmartApp_Clone` folder (or add to .gitignore)
2. Run `npm start`
3. Verify backend starts with warning message
4. Open AI tab in frontend
5. Verify warning banner appears
6. Verify input is disabled

### Test 3: Backend Only
1. Run `npm run start:backend-only`
2. Verify only backend starts
3. Open AI tab in frontend
4. Send a query
5. Verify warning banner appears after query fails

## Gitignore Example

To exclude SmartApp_Clone from git:

```gitignore
# SmartApp_Clone (optional RAG service)
SmartApp_Clone/
```

The backend will work fine without it!

