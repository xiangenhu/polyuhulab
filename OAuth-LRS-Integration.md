# 🔐📊 OAuth + LRS Integration - User Registration & Legitimization

This document describes the complete OAuth authentication and Learning Record Store (LRS) integration system for the Hu Lab portal.

## 🎯 **Complete User Flow**

### **1. OAuth Authentication**
- User clicks "🔑 Login with Google" on `http://localhost:3000`
- Redirects to `oauth.skoonline.org` for Google OAuth
- Google authenticates user and provides token
- Returns to dashboard with `?token=xxx&success=true`

### **2. User Registration & Legitimization**
- **OAuth system loads user profile** from `oauth.skoonline.org`
- **Automatically calls LRS registration** via `/auth/oauth/register`
- **Creates/updates user in xAPI system** with legitimate status
- **Tracks registration activity** in Learning Record Store
- **Sets user permissions and role** (default: student)

### **3. User Profile & Session**
- **Stores comprehensive user profile** in xAPI/LRS
- **Maintains session** with OAuth token
- **Provides dashboard access** with full user context
- **Enables learning analytics tracking**

## 🏗️ **System Architecture**

### **Frontend Components:**
```
oauth-auth.js → OAuth Gateway → User Profile → LRS Registration
     ↓              ↓              ↓              ↓
  Login UI    → Google OAuth → Store Locally → Backend API
```

### **Backend Components:**
```
/auth/oauth/register → xAPI Service → Learning Record Store
         ↓                 ↓              ↓
   User Validation → Profile Storage → Activity Tracking
```

## 📋 **User Profile Structure**

When a user is registered/legitimized, the following profile is created:

```javascript
{
  // Basic Identity
  id: "google-user-id",
  email: "user@example.com",
  name: "Full Name",
  firstName: "First",
  lastName: "Last",
  avatar: "https://photo-url",
  
  // Authentication Info
  provider: "oauth.skoonline.org",
  googleId: "google-sub-id",
  role: "student", // or "instructor", "admin"
  
  // Status & Legitimacy
  isLegitimate: true,
  status: "active",
  createdAt: "2025-09-06T06:00:00Z",
  lastLogin: "2025-09-06T06:00:00Z",
  loginCount: 1,
  
  // User Preferences
  preferences: {
    theme: "light",
    language: "en",
    notifications: true,
    emailNotifications: true
  },
  
  // System Permissions
  permissions: {
    canCreateProjects: true,
    canUploadFiles: true,
    canCollaborate: true,
    canUseAI: true
  }
}
```

## 🔐 **API Endpoints**

### **POST `/auth/oauth/register`**
Registers/legitimizes user after OAuth authentication

**Request:**
```javascript
{
  "user": {
    "email": "user@example.com",
    "name": "User Name",
    "given_name": "User",
    "family_name": "Name",
    "picture": "https://photo-url",
    "sub": "google-user-id"
  },
  "token": "oauth-token"
}
```

**Response:**
```javascript
{
  "success": true,
  "user": { /* full user profile */ },
  "isNewUser": true/false,
  "message": "User registered and legitimized successfully"
}
```

### **GET `/auth/oauth/profile/:email`**
Retrieves user profile from LRS system

**Response:**
```javascript
{
  "success": true,
  "user": { /* user profile without sensitive data */ }
}
```

## 📊 **Learning Record Store Integration**

### **User Registration Tracking:**
```javascript
// xAPI Statement sent to LRS
{
  actor: { email: "user@email.com", name: "User Name" },
  verb: { id: "http://adlnet.gov/expapi/verbs/registered" },
  object: {
    id: "http://hulab.edu.hk/portal",
    definition: {
      type: "http://adlnet.gov/expapi/activities/application",
      name: { "en-US": "HuLab Portal" }
    }
  },
  context: {
    platform: "OAuth via oauth.skoonline.org"
  }
}
```

### **Login Activity Tracking:**
```javascript
// xAPI Statement for each login
{
  actor: { email: "user@email.com", name: "User Name" },
  verb: { id: "http://adlnet.gov/expapi/verbs/experienced" },
  object: {
    id: "http://hulab.edu.hk/portal",
    definition: {
      type: "http://adlnet.gov/expapi/activities/application",
      name: { "en-US": "HuLab Portal" }
    }
  }
}
```

## 🎭 **User Roles & Permissions**

### **Default Role Assignment:**
- **New Users**: `student` (default)
- **Existing Users**: Preserves existing role
- **Permissions**: Full access to portal features

### **Available Roles:**
- `student`: Standard learner access
- `instructor`: Teaching and content creation
- `admin`: Full system administration

### **Permission Matrix:**
| Permission | Student | Instructor | Admin |
|------------|---------|------------|-------|
| Create Projects | ✅ | ✅ | ✅ |
| Upload Files | ✅ | ✅ | ✅ |
| Collaborate | ✅ | ✅ | ✅ |
| Use AI | ✅ | ✅ | ✅ |
| Manage Users | ❌ | ❌ | ✅ |
| View Analytics | ❌ | ✅ | ✅ |

## 🔍 **User Legitimacy Process**

### **Automatic Legitimization:**
1. **OAuth Verification**: User authenticated via Google OAuth
2. **Email Verification**: Email verified by Google
3. **Profile Creation**: Comprehensive profile stored in LRS
4. **Status Assignment**: `isLegitimate: true` flag set
5. **Activity Tracking**: Registration recorded in xAPI

### **Legitimacy Benefits:**
- ✅ **Full Portal Access**: All features available
- ✅ **Data Persistence**: Profile and progress saved
- ✅ **Analytics Tracking**: Learning activities recorded
- ✅ **Collaboration**: Can participate in projects
- ✅ **AI Tools**: Access to AI-powered features

## 🛡️ **Security Features**

### **Authentication Security:**
- OAuth 2.0 via trusted gateway (`oauth.skoonline.org`)
- Google identity verification
- Secure token management
- Session persistence with logout cleanup

### **Data Protection:**
- Sensitive tokens not stored in frontend
- User profile sanitization for API responses
- Secure backend storage in xAPI/LRS
- Activity logging for audit trails

## 🚀 **Testing the Integration**

### **1. Test OAuth Login:**
```bash
# Visit the portal
curl http://localhost:3000
# Click Login → Complete OAuth → Return to dashboard
```

### **2. Verify User Registration:**
```bash
# Check if user profile endpoint works
curl http://localhost:3000/auth/oauth/profile/user@example.com
```

### **3. Monitor LRS Activity:**
- Check xAPI statements for user registration
- Verify learning analytics tracking
- Confirm user profile storage

## 📈 **Benefits of This Integration**

1. **🔐 Secure Authentication**: OAuth 2.0 with Google verification
2. **📊 Learning Analytics**: All user activity tracked in LRS
3. **👤 User Management**: Comprehensive profile system
4. **🎯 Personalization**: Role-based permissions and preferences
5. **🔍 Audit Trail**: Complete activity logging
6. **⚡ Seamless Experience**: Automatic registration and legitimization
7. **🛡️ Security**: Multi-layered authentication and authorization

## ✅ **Current Status**

- **🟢 OAuth Authentication**: Fully functional
- **🟢 User Registration**: Automatic via API
- **🟢 LRS Integration**: Profile storage and activity tracking
- **🟢 Legitimization**: Automatic status assignment
- **🟢 Role Management**: Default roles with permissions
- **🟢 Security**: Comprehensive token and session management

**The system now automatically registers and legitimizes every user who successfully authenticates via Google OAuth, creating their profile in the Learning Record Store and enabling full portal access! 🎉**