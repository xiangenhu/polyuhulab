# Complete Portal Implementation Prompt for Hu Lab Educational Platform

## Project Overview
Build a complete educational research collaboration portal for Hu Lab at The Hong Kong Polytechnic University. This portal facilitates Human-AI collaboration in education with comprehensive features for research, learning analytics, and educational technology implementation.

## Technical Requirements

### Core Technologies
- **Backend**: Node.js with Express.js
- **Frontend**: jQuery, HTML5, CSS3 (with glass morphism design from provided template)
- **Data Storage**: xAPI (Experience API) for ALL learning analytics and activity tracking
- **File Storage**: Google Cloud Storage for ALL file operations
- **Authentication**: Google OAuth 2.0 with session management
- **Real-time**: WebSockets for live collaboration features
- **NO LOCAL STORAGE**: All data must be stored in xAPI LRS or Google Cloud Storage

### Environment Variables Required
Create a `.env` file with:
```
PORT=3000
NODE_ENV=development

# xAPI Configuration
XAPI_ENDPOINT=<user_will_provide>
XAPI_USERNAME=<user_will_provide>
XAPI_PASSWORD=<user_will_provide>

# Google Cloud Storage
GCS_PROJECT_ID=<user_will_provide>
GCS_BUCKET_NAME=<user_will_provide>
GCS_KEY_FILE=<path_to_service_account_json>

# Google OAuth
GOOGLE_CLIENT_ID=<user_will_provide>
GOOGLE_CLIENT_SECRET=<user_will_provide>
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Session Secret
SESSION_SECRET=<generate_random_string>
```

## Complete Implementation Structure

### Directory Structure
```
/
├── server.js                 # Main server entry point
├── package.json
├── .env
├── .gitignore
├── /config
│   ├── xapi.js              # xAPI configuration and client
│   ├── gcs.js               # Google Cloud Storage configuration
│   └── auth.js              # Authentication configuration
├── /controllers
│   ├── authController.js    # Authentication handling
│   ├── userController.js    # User profile management
│   ├── researchController.js # Research projects CRUD
│   ├── analyticsController.js # Learning analytics
│   ├── collaborationController.js # Real-time collaboration
│   └── assessmentController.js # Assessment management
├── /models
│   ├── xapiStatements.js    # xAPI statement builders
│   ├── userModel.js         # User data structure for xAPI
│   ├── projectModel.js      # Research project structure
│   └── analyticsModel.js    # Analytics data structures
├── /routes
│   ├── auth.js
│   ├── api.js
│   ├── research.js
│   ├── analytics.js
│   └── collaboration.js
├── /middleware
│   ├── authentication.js    # Auth middleware
│   ├── xapiLogger.js        # Log all activities to xAPI
│   └── errorHandler.js      # Global error handling
├── /services
│   ├── xapiService.js       # xAPI CRUD operations
│   ├── gcsService.js        # GCS file operations
│   ├── aiService.js         # AI integration services
│   └── analyticsService.js  # Analytics processing
├── /public
│   ├── /css
│   │   └── style.css        # Enhanced from provided template
│   ├── /js
│   │   ├── app.js           # Main jQuery application
│   │   ├── auth.js          # Authentication UI
│   │   ├── dashboard.js     # Dashboard functionality
│   │   ├── research.js      # Research module
│   │   ├── analytics.js     # Analytics visualization
│   │   ├── collaboration.js # Real-time collaboration
│   │   └── xapi-client.js   # Client-side xAPI tracking
│   └── /images
├── /views
│   ├── index.html           # Enhanced from provided template
│   ├── dashboard.html       # User dashboard
│   ├── research.html        # Research management
│   ├── analytics.html       # Analytics dashboard
│   ├── collaboration.html   # Collaboration workspace
│   └── assessment.html      # Assessment tools
└── /utils
    ├── xapiHelpers.js       # xAPI utility functions
    └── gcsHelpers.js        # GCS utility functions
```

## Detailed Implementation Requirements

### 1. Server Setup (server.js)
```javascript
// Complete Express server with:
- Express.js setup with middleware
- Session management (store sessions in xAPI)
- WebSocket server for real-time features
- Route mounting
- Error handling
- xAPI activity logging for ALL requests
- Google Cloud Storage initialization
```

### 2. xAPI Integration (/config/xapi.js & /services/xapiService.js)
```javascript
// Implement complete xAPI client with:
- Statement creation for ALL user activities
- Activity profiles storage (user profiles, preferences)
- State management (application state)
- Document storage (research documents metadata)
- Result tracking (assessment results, analytics)
- Context preservation (session, location, platform)
- Custom verb definitions for educational activities:
  * researched, collaborated, analyzed, assessed, reviewed
  * uploaded, downloaded, shared, commented, annotated
```

### 3. Google Cloud Storage (/config/gcs.js & /services/gcsService.js)
```javascript
// Complete GCS integration:
- File upload with resumable uploads for large files
- File download with signed URLs
- Folder structure management
- File versioning
- Metadata storage (link to xAPI statements)
- Access control per user/project
- Automatic file type detection and validation
- Image thumbnail generation
- Document preview generation
```

### 4. Authentication System
```javascript
// Google OAuth implementation with:
- Login/logout flow
- Session management (store in xAPI)
- Role-based access control (student, educator, researcher, admin)
- Profile completion after first login
- Activity tracking for all auth events
```

### 5. Dashboard Module
```javascript
// Interactive dashboard showing:
- User's recent activities (from xAPI)
- Research projects overview
- Collaboration invitations
- Analytics summary
- Upcoming assessments
- File management interface
- Real-time notifications
```

### 6. Research Module (Based on RIDE-I Framework)
```javascript
// Complete research project management:

// Research Phase
- Create research proposals
- Literature review uploads (to GCS)
- Hypothesis tracking (in xAPI)
- Research question management

// Innovation Phase  
- Idea brainstorming boards
- Concept mapping tools
- Innovation tracking metrics

// Development Phase
- Project timeline management
- Resource allocation
- Development milestone tracking
- File versioning for iterations

// Evaluation Phase
- Data collection forms
- Analysis tools integration
- Result visualization
- Statistical reporting

// Implementation Phase
- Deployment planning
- Scaling metrics
- Impact measurement
- Dissemination tracking
```

### 7. Human-AI Collaboration Features
```javascript
// AI integration features:
- AI-assisted writing/editing
- Code generation and review
- Research synthesis
- Question generation
- Feedback analysis
- Learning path recommendations
- All AI interactions logged to xAPI with:
  * Prompt tracking
  * Response quality metrics
  * User satisfaction ratings
  * Learning outcome correlation
```

### 8. Learning Analytics Dashboard
```javascript
// Comprehensive analytics:
- Real-time activity streaming from xAPI
- Learning pattern visualization
- Engagement metrics
- Progress tracking
- Comparative analysis
- Predictive analytics
- Custom report generation
- Export to various formats
```

### 9. Assessment System
```javascript
// Assessment management:
- Assessment creation tools
- Rubric management
- Peer review system
- Self-assessment tools
- Portfolio management
- Integrity checking
- All assessment data stored in xAPI
- Supporting files in GCS
```

### 10. Multimodal Interaction Tracking
```javascript
// Track all interaction types:
- Text input analysis
- Click patterns
- Time on task
- Navigation patterns
- Collaboration patterns
- File access patterns
- Store all as xAPI statements with rich context
```

### 11. Frontend Implementation (jQuery-based)
```javascript
// Enhanced UI from provided template with:

// Core UI Components
- Glass morphism design system
- Responsive navigation
- Modal system for forms
- Toast notifications
- Loading states
- Error handling UI

// Interactive Features
- Drag-and-drop file uploads
- Real-time collaboration cursors
- Live activity feed
- Interactive charts (Chart.js)
- Searchable data tables
- Infinite scroll for activity lists
- Rich text editors
- Code editors with syntax highlighting

// xAPI Tracking on Frontend
- Page view tracking
- Interaction tracking (clicks, hovers, scrolls)
- Time tracking
- Error tracking
- Performance metrics
```

### 12. WebSocket Real-time Features
```javascript
// Implement Socket.io for:
- Live collaboration on documents
- Real-time activity feeds
- Instant notifications
- Presence indicators
- Collaborative editing
- Screen sharing capabilities
- Chat system
- All real-time events logged to xAPI
```

### 13. API Endpoints

```javascript
// Authentication
POST   /auth/google         - Google OAuth initiation
GET    /auth/google/callback - OAuth callback
POST   /auth/logout         - Logout
GET    /api/user/profile    - Get user profile

// Research Projects
GET    /api/research/projects      - List projects
POST   /api/research/projects      - Create project
GET    /api/research/projects/:id  - Get project details
PUT    /api/research/projects/:id  - Update project
DELETE /api/research/projects/:id  - Delete project
POST   /api/research/projects/:id/collaborate - Invite collaborators

// Files (all stored in GCS)
POST   /api/files/upload           - Upload file
GET    /api/files/:id              - Download file
DELETE /api/files/:id              - Delete file
GET    /api/files/:id/versions     - Get file versions
POST   /api/files/:id/share        - Share file

// Analytics (from xAPI)
GET    /api/analytics/dashboard    - Analytics summary
GET    /api/analytics/activities   - Activity stream
GET    /api/analytics/reports      - Generate reports
POST   /api/analytics/export       - Export data

// Assessments
GET    /api/assessments            - List assessments
POST   /api/assessments            - Create assessment
POST   /api/assessments/:id/submit - Submit assessment
GET    /api/assessments/:id/results - Get results

// AI Features
POST   /api/ai/complete           - Text completion
POST   /api/ai/analyze            - Content analysis
POST   /api/ai/feedback           - Generate feedback
POST   /api/ai/suggestions        - Get suggestions
```

### 14. xAPI Statement Templates

```javascript
// User Registration Statement
{
  actor: { mbox: "mailto:user@email.com", name: "User Name" },
  verb: { id: "http://adlnet.gov/expapi/verbs/registered", display: {"en-US": "registered"} },
  object: { id: "http://hulab.edu.hk/portal", definition: { type: "http://adlnet.gov/expapi/activities/application" } },
  context: { platform: "HuLab Portal", language: "en-US" }
}

// File Upload Statement
{
  actor: { mbox: "mailto:user@email.com" },
  verb: { id: "http://hulab.edu.hk/verbs/uploaded", display: {"en-US": "uploaded"} },
  object: { id: "gcs://bucket/file.pdf", definition: { type: "http://adlnet.gov/expapi/activities/file" } },
  result: { response: "file_id", success: true, extensions: { "http://hulab.edu.hk/size": 1024000 } },
  context: { contextActivities: { parent: [{ id: "project_id" }] } }
}

// Collaboration Statement
{
  actor: { mbox: "mailto:user@email.com" },
  verb: { id: "http://hulab.edu.hk/verbs/collaborated", display: {"en-US": "collaborated"} },
  object: { id: "http://hulab.edu.hk/project/123", definition: { type: "http://adlnet.gov/expapi/activities/project" } },
  context: { team: [{ mbox: "mailto:collaborator@email.com" }], extensions: { "http://hulab.edu.hk/action": "edited" } }
}

// AI Interaction Statement
{
  actor: { mbox: "mailto:user@email.com" },
  verb: { id: "http://hulab.edu.hk/verbs/queried", display: {"en-US": "queried AI"} },
  object: { id: "http://hulab.edu.hk/ai/session/456", definition: { type: "http://hulab.edu.hk/activities/ai-interaction" } },
  result: { response: "ai_response", score: { scaled: 0.85 }, extensions: { "http://hulab.edu.hk/tokens": 150 } }
}
```

### 15. Security Requirements
```javascript
// Implement comprehensive security:
- Input validation on all endpoints
- XSS protection
- CSRF tokens for forms
- Rate limiting
- File upload restrictions
- SQL injection prevention (parameterized queries)
- Secure session management
- HTTPS enforcement in production
- Content Security Policy headers
- API key rotation
- Audit logging to xAPI
```

### 16. Performance Optimization
```javascript
// Optimize for performance:
- Implement caching strategy (Redis for session cache)
- Lazy loading for large datasets
- Image optimization before GCS upload
- CDN integration for static assets
- Database query optimization
- Pagination for all list endpoints
- Compression for API responses
- WebSocket connection pooling
```

### 17. Error Handling
```javascript
// Comprehensive error handling:
- Global error handler middleware
- Structured error responses
- Error logging to xAPI
- User-friendly error messages
- Retry logic for external services
- Graceful degradation
- Circuit breaker pattern for external APIs
```

### 18. Testing Requirements
```javascript
// Include test files:
- Unit tests for all services
- Integration tests for API endpoints
- xAPI statement validation tests
- GCS upload/download tests
- Authentication flow tests
- WebSocket connection tests
- Frontend jQuery interaction tests
```

### 19. Deployment Configuration
```javascript
// Production deployment files:
- Dockerfile for containerization
- docker-compose.yml for local development
- Kubernetes manifests for cloud deployment
- CI/CD pipeline configuration (GitHub Actions)
- Environment-specific configurations
- Health check endpoints
- Monitoring setup (Prometheus metrics)
```

### 20. Documentation
```javascript
// Generate comprehensive documentation:
- API documentation (Swagger/OpenAPI)
- xAPI profile documentation
- User guide
- Administrator guide
- Developer documentation
- Deployment guide
- Security documentation
```

## Package.json Dependencies
```json
{
  "name": "hulab-portal",
  "version": "1.0.0",
  "description": "Hu Lab Educational Research Collaboration Portal",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.18.0",
    "express-session": "^1.17.0",
    "passport": "^0.6.0",
    "passport-google-oauth20": "^2.0.0",
    "@google-cloud/storage": "^6.0.0",
    "tincanjs": "^0.50.0",
    "socket.io": "^4.0.0",
    "dotenv": "^16.0.0",
    "cors": "^2.8.0",
    "helmet": "^7.0.0",
    "express-rate-limit": "^6.0.0",
    "multer": "^1.4.0",
    "uuid": "^9.0.0",
    "bcrypt": "^5.0.0",
    "jsonwebtoken": "^9.0.0",
    "axios": "^1.0.0",
    "moment": "^2.29.0",
    "compression": "^1.7.0",
    "express-validator": "^7.0.0"
  },
  "devDependencies": {
    "nodemon": "^2.0.0",
    "jest": "^29.0.0"
  }
}
```

## Special Implementation Notes

1. **xAPI First Architecture**: Every single user action, file operation, and system event MUST generate an xAPI statement. No exceptions.

2. **Zero Local Storage**: No data should be stored locally. Use xAPI for all structured data and GCS for all files. Even temporary files should go to GCS with TTL.

3. **Real-time Sync**: All data changes should immediately reflect across all connected clients using WebSockets.

4. **AI Integration**: Implement placeholder functions for AI features that can be connected to actual AI services later.

5. **Responsive Design**: The portal must work perfectly on desktop, tablet, and mobile devices.

6. **Accessibility**: Follow WCAG 2.1 AA standards for all UI components.

7. **Internationalization**: Structure the code to support multiple languages, starting with English and Chinese.

## File Creation Priority

1. Start with server.js and package.json
2. Create config files (xapi.js, gcs.js, auth.js)
3. Implement authentication system
4. Build xAPI service layer
5. Implement GCS service layer
6. Create API routes
7. Build frontend pages starting with index.html
8. Add jQuery interactivity
9. Implement WebSocket features
10. Add analytics and reporting
11. Complete assessment system
12. Add AI integration points
13. Implement security features
14. Add monitoring and logging
15. Create documentation

## Expected User Inputs

The user will need to provide:
1. xAPI endpoint URL
2. xAPI username and password
3. Google Cloud Project ID
4. Google Cloud Storage bucket name
5. Google Cloud service account key file
6. Google OAuth client ID and secret

Everything else should be automatically generated and configured by the system.

## Success Criteria

The portal is complete when:
1. All user activities are tracked in xAPI
2. All files are stored in Google Cloud Storage
3. Authentication works with Google OAuth
4. Real-time collaboration features work
5. Analytics dashboard shows meaningful insights
6. The UI matches the glass morphism design aesthetic
7. All RIDE-I framework phases are supported
8. The system can handle 100+ concurrent users
9. Page load times are under 2 seconds
10. All security measures are implemented