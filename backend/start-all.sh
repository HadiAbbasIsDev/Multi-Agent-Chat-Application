#!/bin/bash
# Script to start both backend and RAG service together

echo "🚀 Starting Backend and RAG Service..."
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
RAG_SERVICE_DIR="$SCRIPT_DIR/../SmartApp_Clone/rag_service"

# Check if RAG service directory exists
if [ ! -d "$RAG_SERVICE_DIR" ]; then
    echo "❌ Error: RAG service directory not found at $RAG_SERVICE_DIR"
    exit 1
fi

# Function to handle cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down services..."
    kill $BACKEND_PID $RAG_PID 2>/dev/null
    exit
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start RAG service in background
echo "📦 Starting RAG Service..."
cd "$RAG_SERVICE_DIR"
# Try python3 first, fallback to python
if command -v python3 &> /dev/null; then
    python3 main.py &
else
    python main.py &
fi
RAG_PID=$!
cd "$SCRIPT_DIR"

# Wait a moment for RAG service to start
sleep 2

# Check if RAG service started successfully
if ! kill -0 $RAG_PID 2>/dev/null; then
    echo "❌ Error: RAG service failed to start"
    exit 1
fi

echo "✅ RAG Service started (PID: $RAG_PID)"
echo ""

# Start backend
echo "🔧 Starting Backend Server..."
npm start &
BACKEND_PID=$!

echo "✅ Backend Server started (PID: $BACKEND_PID)"
echo ""
echo "📝 Services running:"
echo "   - Backend: http://localhost:3000"
echo "   - RAG Service: http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop both services"

# Wait for both processes
wait

