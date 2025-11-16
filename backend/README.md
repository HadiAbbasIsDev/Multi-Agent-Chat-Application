# Chat Application Backend

A complete Node.js backend for a mobile chat application with AI-powered search features using PostgreSQL and Socket.IO for real-time communication.

## Features

- **User Authentication**: JWT-based authentication with @nu.edu.pk domain validation
- **Contact Management**: Send, accept, reject contact requests
- **Direct Messaging**: One-on-one conversations with read receipts
- **Group Chat**: Create groups (up to 200 members), manage members, promote/demote admins
- **Real-time Communication**: Socket.IO for instant message delivery, typing indicators, online status
- **Message Features**: Edit messages, delete within 10 minutes, image attachments
- **AI Search**: Query chat history using vector search (MongoDB Atlas integration)
- **Read Receipts**: Track message delivery and read status

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL with UUID support
- **Real-time**: Socket.IO
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcrypt
- **File Upload**: Multer
- **Validation**: express-validator

## Prerequisites

- Node.js (v16 or higher)
- PostgreSQL (v13 or higher)
- npm or yarn

## Installation

1. **Clone the repository**

```bash
git clone <repository-url>
cd chat-app-backend
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up PostgreSQL database**

Create a new PostgreSQL database:

```sql
CREATE DATABASE chat_app;
```

4. **Configure environment variables**

Copy `.env.example` to `.env` and update the values:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=chat_app
DB_USER=postgres
DB_PASSWORD=your_password

JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
JWT_EXPIRES_IN=7d

MAX_FILE_SIZE=5242880
UPLOAD_DIR=./uploads

AI_SERVICE_URL=http://localhost:5000/api/ai
AI_SERVICE_API_KEY=your_ai_service_key
```

5. **Run database migrations**

```bash
npm run migrate
```

6. **Seed the database (optional)**

```bash
npm run seed
```

This creates 5 sample users (all password: `Test123!`):
- alice@nu.edu.pk
- bob@nu.edu.pk
- charlie@nu.edu.pk
- diana@nu.edu.pk
- eve@nu.edu.pk

## Running the Application

**Development mode** (with auto-reload):

```bash
npm run dev
```

**Production mode**:

```bash
npm start
```

The server will start on `http://localhost:3000`

## API Documentation

### Authentication

#### Register
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@nu.edu.pk",
  "password": "Password123!",
  "displayName": "John Doe",
  "avatarUrl": "https://example.com/avatar.jpg" (optional)
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@nu.edu.pk",
  "password": "Password123!"
}
```

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <token>
```

### Users

#### Search Users
```http
GET /api/users/search?q=alice
Authorization: Bearer <token>
```

#### Get User by ID
```http
GET /api/users/:userId
Authorization: Bearer <token>
```

#### Update Profile
```http
PATCH /api/users/me
Authorization: Bearer <token>
Content-Type: application/json

{
  "displayName": "New Name",
  "avatarUrl": "https://example.com/new-avatar.jpg"
}
```

### Contact Requests

#### Send Contact Request
```http
POST /api/contacts
Authorization: Bearer <token>
Content-Type: application/json

{
  "toUserId": "uuid"
}
```

#### Get Pending Requests
```http
GET /api/contacts/pending
Authorization: Bearer <token>
```

#### Accept Request
```http
POST /api/contacts/:requestId/accept
Authorization: Bearer <token>
```

#### Reject Request
```http
POST /api/contacts/:requestId/reject
Authorization: Bearer <token>
```

### Threads

#### Create Direct Thread
```http
POST /api/threads/direct
Authorization: Bearer <token>
Content-Type: application/json

{
  "userId": "uuid"
}
```

#### Get All Threads
```http
GET /api/threads
Authorization: Bearer <token>
```

#### Get Thread Details
```http
GET /api/threads/:threadId
Authorization: Bearer <token>
```

### Messages

#### Send Message
```http
POST /api/messages/:threadId
Authorization: Bearer <token>
Content-Type: multipart/form-data

body: "Hello world!"
image: <file> (optional)
```

#### Get Messages
```http
GET /api/messages/:threadId?limit=50&before=2024-01-01T00:00:00Z
Authorization: Bearer <token>
```

#### Edit Message
```http
PATCH /api/messages/:messageId
Authorization: Bearer <token>
Content-Type: application/json

{
  "body": "Updated message"
}
```

#### Delete Message
```http
DELETE /api/messages/:messageId
Authorization: Bearer <token>
```

#### Mark as Read
```http
POST /api/messages/:messageId/read
Authorization: Bearer <token>
```

### Groups

#### Create Group
```http
POST /api/groups
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Study Group",
  "memberIds": ["uuid1", "uuid2"],
  "pictureUrl": "https://example.com/group.jpg" (optional)
}
```

#### Update Group
```http
PATCH /api/groups/:groupId
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "New Group Name",
  "pictureUrl": "https://example.com/new-pic.jpg"
}
```

#### Add Member
```http
POST /api/groups/:groupId/members
Authorization: Bearer <token>
Content-Type: application/json

{
  "userId": "uuid"
}
```

#### Remove Member
```http
DELETE /api/groups/:groupId/members/:userId
Authorization: Bearer <token>
```

#### Promote to Admin
```http
POST /api/groups/:groupId/members/:userId/promote
Authorization: Bearer <token>
```

#### Leave Group
```http
POST /api/groups/:groupId/leave
Authorization: Bearer <token>
```

### AI Search

#### Submit Query
```http
POST /api/ai/query
Authorization: Bearer <token>
Content-Type: application/json

{
  "prompt": "What did we discuss about the project?"
}
```

#### Get Query History
```http
GET /api/ai/queries?limit=20
Authorization: Bearer <token>
```

## Socket.IO Events

### Client → Server

- `join_thread`: Join a thread room
- `leave_thread`: Leave a thread room
- `typing_start`: User started typing
- `typing_stop`: User stopped typing
- `messages_read`: Mark messages as read
- `call_initiate`: Start voice/video call
- `call_answer`: Answer incoming call
- `call_end`: End call
- `webrtc_offer`, `webrtc_answer`, `webrtc_ice_candidate`: WebRTC signaling

### Server → Client

- `new_message`: New message received
- `message_edited`: Message was edited
- `message_deleted`: Message was deleted
- `message_delivered`: Message delivered to recipient
- `message_read`: Message read by recipient
- `user_typing`: User is typing
- `user_stopped_typing`: User stopped typing
- `user_online`: Contact came online
- `user_offline`: Contact went offline
- `contact_request_received`: New contact request
- `contact_request_accepted`: Request accepted
- `added_to_group`: Added to a group
- `member_added`: Member added to group
- `member_removed`: Member removed from group
- `group_updated`: Group details updated

## Database Schema

The application uses the following main tables:

- `users`: User accounts and profiles
- `contact_requests`: Friend/contact requests
- `chat_threads`: Base table for all conversations
- `direct_threads`: One-on-one conversations
- `groups`: Group chat metadata
- `group_members`: Group membership and roles
- `messages`: All messages
- `attachments`: Image attachments
- `read_receipts`: Message delivery and read status
- `ai_queries`: User AI search queries
- `ai_results`: AI-generated responses with citations

## Project Structure

```
chat-app-backend/
├── src/
│   ├── config/
│   │   ├── database.js       # PostgreSQL connection
│   │   └── index.js          # App configuration
│   ├── database/
│   │   ├── migrate.js        # Migration script
│   │   └── seed.js           # Seed script
│   ├── middleware/
│   │   ├── auth.js           # JWT authentication
│   │   └── validation.js     # Request validation
│   ├── routes/
│   │   ├── auth.js           # Authentication routes
│   │   ├── users.js          # User management
│   │   ├── contacts.js       # Contact requests
│   │   ├── threads.js        # Thread management
│   │   ├── messages.js       # Messaging
│   │   ├── groups.js         # Group management
│   │   └── ai.js             # AI search
│   ├── sockets/
│   │   └── index.js          # Socket.IO handlers
│   └── server.js             # Express app setup
├── schema.sql                # Database schema
├── package.json
├── .env.example
└── README.md
```

## AI Service Integration

The backend expects an AI service running separately that handles vector search. The AI service should expose:

**POST /api/ai/search**
```json
Request:
{
  "userId": "uuid",
  "query": "search query",
  "topK": 5
}

Response:
{
  "answer": "Generated answer text",
  "citations": [
    {
      "messageId": "uuid",
      "threadId": "uuid", 
      "score": 0.95
    }
  ]
}
```

The AI team will handle:
- Message embedding generation
- Vector storage in MongoDB Atlas
- Similarity search
- Answer generation

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- Email domain validation (@nu.edu.pk only)
- Rate limiting on API endpoints
- Input validation and sanitization
- SQL injection prevention (parameterized queries)
- File upload validation (images only, size limits)
- CORS configuration

## Error Handling

The API returns consistent error responses:

```json
{
  "error": "Error message"
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `409`: Conflict
- `500`: Internal Server Error
- `503`: Service Unavailable

## Development Tips

1. Use `nodemon` for auto-reload during development
2. Check server logs for detailed error messages
3. Use Postman or similar tools to test API endpoints
4. Monitor Socket.IO connections in browser DevTools
5. Use PostgreSQL GUI tools (pgAdmin, TablePlus) to inspect database

## Production Deployment

1. Set `NODE_ENV=production`
2. Use a strong `JWT_SECRET`
3. Configure proper CORS origins
4. Set up PostgreSQL with proper credentials
5. Use a process manager (PM2)
6. Set up HTTPS/SSL
7. Configure file upload storage (S3, CloudFlare R2, etc.)
8. Set up monitoring and logging
9. Configure database backups

## License

MIT

## Support

For issues and questions, please create an issue in the repository.