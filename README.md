# Hu Lab Portal - Educational Research Collaboration Platform

A comprehensive educational research collaboration portal for Hu Lab at The Hong Kong Polytechnic University, facilitating Human-AI collaboration in education with real-time features, learning analytics, and cloud-based storage.

## Features

### Core Functionality
- **Google OAuth Authentication**: Secure login with Google accounts
- **xAPI Integration**: All user activities and data stored in xAPI LRS (no local storage)
- **Google Cloud Storage**: All file operations handled through GCS
- **Real-time Collaboration**: WebSocket-powered collaborative features
- **Learning Analytics**: Comprehensive tracking and visualization of learning activities
- **AI Integration**: Placeholder AI services ready for integration

### Key Modules
- **Dashboard**: Personal overview with activity feeds and statistics
- **Research Management**: RIDE-I framework implementation for research projects
- **Analytics**: Advanced visualization of learning data and insights
- **Collaboration**: Real-time document editing and team communication
- **Assessment**: Creation, submission, and review of assessments

## Technology Stack

### Backend
- **Node.js & Express.js**: Server framework
- **Passport.js**: Authentication with Google OAuth 2.0
- **Socket.io**: Real-time WebSocket communication
- **TinCan.js**: xAPI/LRS integration
- **Google Cloud Storage**: File storage and management

### Frontend
- **jQuery**: DOM manipulation and AJAX
- **Chart.js**: Analytics visualization
- **Glass Morphism UI**: Modern translucent design
- **WebSocket Client**: Real-time updates

## Installation

### Prerequisites
- Node.js 14.0.0 or higher
- Google Cloud Platform account with Storage API enabled
- xAPI LRS endpoint (e.g., SCORM Cloud, Learning Locker)
- Google OAuth 2.0 credentials

### Setup Instructions

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/polyuhulab.git
cd polyuhulab
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

Edit `.env` with your actual values:
```env
# xAPI Configuration
XAPI_ENDPOINT=https://your-lrs-endpoint.com/xapi/
XAPI_USERNAME=your_xapi_username
XAPI_PASSWORD=your_xapi_password

# Google Cloud Storage
GCS_PROJECT_ID=your-gcp-project-id
GCS_BUCKET_NAME=hulab-portal-storage
GCS_KEY_FILE=./credentials/gcs-service-account.json

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Session Secret
SESSION_SECRET=generate-a-random-secret-string-here
```

4. **Set up Google Cloud Storage**
- Create a GCS bucket
- Generate a service account key
- Save the key file to `./credentials/gcs-service-account.json`

5. **Configure Google OAuth**
- Go to [Google Cloud Console](https://console.cloud.google.com/)
- Create OAuth 2.0 credentials
- Add `http://localhost:3000/auth/google/callback` to authorized redirect URIs

6. **Start the application**
```bash
# Development mode
npm run dev

# Production mode
npm start
```

7. **Access the application**
Open your browser and navigate to `http://localhost:3000`

## Project Structure

```
/
├── server.js              # Main Express server
├── config/               # Configuration files
│   ├── xapi.js          # xAPI LRS configuration
│   ├── gcs.js           # Google Cloud Storage config
│   └── auth.js          # Authentication config
├── services/            # Business logic services
│   ├── xapiService.js   # xAPI operations
│   ├── gcsService.js    # GCS file operations
│   ├── aiService.js     # AI integration
│   └── analyticsService.js # Analytics processing
├── routes/              # API endpoints
│   ├── auth.js          # Authentication routes
│   ├── api.js           # Core API routes
│   ├── research.js      # Research management
│   ├── analytics.js     # Analytics endpoints
│   └── collaboration.js # Collaboration features
├── middleware/          # Express middleware
│   ├── authentication.js # Auth checks
│   ├── xapiLogger.js    # Activity logging
│   └── errorHandler.js  # Error handling
├── public/              # Static files
│   ├── css/            # Stylesheets
│   └── js/             # Client-side JavaScript
├── views/              # HTML pages
│   ├── index.html      # Landing page
│   ├── dashboard.html  # User dashboard
│   ├── research.html   # Research management
│   ├── analytics.html  # Analytics dashboard
│   ├── collaboration.html # Collaboration workspace
│   └── assessment.html # Assessment interface
└── utils/              # Utility functions
```

## API Endpoints

### Authentication
- `GET /auth/google` - Initiate Google OAuth
- `GET /auth/google/callback` - OAuth callback
- `POST /auth/logout` - Logout user
- `GET /api/user/profile` - Get user profile

### Research Projects
- `GET /api/research/projects` - List projects
- `POST /api/research/projects` - Create project
- `GET /api/research/projects/:id` - Get project
- `PUT /api/research/projects/:id` - Update project
- `DELETE /api/research/projects/:id` - Delete project

### Files
- `POST /api/files/upload` - Upload file to GCS
- `GET /api/files/:id` - Download file
- `DELETE /api/files/:id` - Delete file

### Analytics
- `GET /api/analytics/dashboard` - Dashboard data
- `GET /api/analytics/activities` - Activity stream
- `POST /api/analytics/export` - Export data

## xAPI Statement Structure

All user activities are tracked as xAPI statements. Example:
```json
{
  "actor": {
    "mbox": "mailto:user@email.com",
    "name": "User Name"
  },
  "verb": {
    "id": "http://hulab.edu.hk/verbs/researched",
    "display": {"en-US": "researched"}
  },
  "object": {
    "id": "http://hulab.edu.hk/project/123",
    "definition": {
      "type": "http://hulab.edu.hk/activities/project"
    }
  },
  "context": {
    "platform": "HuLab Portal",
    "language": "en-US"
  }
}
```

## Security Features

- **Authentication**: Google OAuth 2.0
- **Session Management**: Secure session handling
- **Input Validation**: All inputs validated and sanitized
- **Rate Limiting**: API rate limiting to prevent abuse
- **CORS Protection**: Configured CORS headers
- **File Validation**: Type and size restrictions
- **XSS Protection**: Content Security Policy headers
- **HTTPS**: Enforced in production

## Development

### Running Tests
```bash
npm test
```

### Development Mode
```bash
npm run dev
```

### Debugging
Set `NODE_ENV=development` for detailed logging

## Deployment

### Docker
```bash
docker build -t hulab-portal .
docker run -p 3000:3000 --env-file .env hulab-portal
```

### Production Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Configure HTTPS/SSL certificates
- [ ] Set up proper GCS credentials
- [ ] Configure production xAPI endpoint
- [ ] Set strong session secret
- [ ] Enable rate limiting
- [ ] Configure monitoring

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Support

For issues and questions, please create an issue in the GitHub repository.

## License

MIT License - See LICENSE file for details

## Acknowledgments

- Hu Lab @ The Hong Kong Polytechnic University
- Built with the vision of enhancing Human-AI collaboration in education