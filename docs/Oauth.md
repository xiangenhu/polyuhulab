# 🔐 How to Integrate Your Website with oauth.skoonline.org

This guide shows you how to add Google OAuth authentication to your website using the `oauth.skoonline.org` gateway.

## 🚀 Quick Start (3 Steps)

### Step 1: Add Login Button to Your Website

```html
<!-- Add this button anywhere on your site -->
<button onclick="loginWithGoogle()">
    🔑 Login with Google
</button>

<script>
function loginWithGoogle() {
    // Replace YOUR_WEBSITE_URL with your actual website
    const redirectUrl = 'https://YOUR_WEBSITE_URL/dashboard.html';
    window.location.href = `https://oauth.skoonline.org/auth/google/login?redirect_uri=${encodeURIComponent(redirectUrl)}`;
}
</script>
```

### Step 2: Handle OAuth Return on Your Website

```html
<!-- Add this to your return page (e.g., dashboard.html) -->
<script>
// Check for OAuth success in URL parameters
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');
const success = urlParams.get('success');

if (success && token) {
    // Store the gateway token
    localStorage.setItem('oauth_token', token);
    
    // Clean the URL
    window.history.replaceState({}, document.title, window.location.pathname);
    
    // Load user information
    loadUserProfile();
}

async function loadUserProfile() {
    const token = localStorage.getItem('oauth_token');
    if (!token) return;

    try {
        const response = await fetch('https://oauth.skoonline.org/auth/userinfo', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const userInfo = await response.json();
            
            // Display user info
            document.getElementById('user-section').innerHTML = `
                <h3>Welcome, ${userInfo.user.name}!</h3>
                <p>Email: ${userInfo.user.email}</p>
                ${userInfo.user.picture ? `<img src="${userInfo.user.picture}" width="50" height="50" style="border-radius: 25px;">` : ''}
                <button onclick="logout()">Logout</button>
            `;
            
            document.getElementById('user-section').style.display = 'block';
            document.getElementById('login-section').style.display = 'none';
        } else {
            console.error('Failed to load user info');
            logout();
        }
    } catch (error) {
        console.error('Error loading user info:', error);
        logout();
    }
}

function logout() {
    localStorage.removeItem('oauth_token');
    document.getElementById('user-section').style.display = 'none';
    document.getElementById('login-section').style.display = 'block';
}

// Check if user is already logged in when page loads
window.onload = function() {
    const token = localStorage.getItem('oauth_token');
    if (token) {
        loadUserProfile();
    }
};
</script>
```

### Step 3: Use Google Services (Optional)

```javascript
// Get Google access token to call Google APIs
async function getGoogleAccessToken() {
    const gatewayToken = localStorage.getItem('oauth_token');
    if (!gatewayToken) return null;

    try {
        const response = await fetch('https://oauth.skoonline.org/auth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                gatewayToken: gatewayToken,
                provider: 'google',
                scope: ['https://www.googleapis.com/auth/userinfo.profile'] // Add scopes you need
            })
        });

        if (response.ok) {
            const data = await response.json();
            return data.access_token;
        }
    } catch (error) {
        console.error('Error getting Google token:', error);
    }
    return null;
}

// Example: Call Google API
async function callGoogleAPI() {
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) return;

    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    const userData = await response.json();
    console.log('Google user data:', userData);
}
```

## 📧 Gmail SMTP Integration

### Frontend: Get SMTP-Ready Token

```javascript
async function getGmailToken() {
    const gatewayToken = localStorage.getItem('oauth_token');
    
    const response = await fetch('https://oauth.skoonline.org/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            gatewayToken: gatewayToken,
            provider: 'google',
            scope: ['https://mail.google.com/'] // Gmail scope
        })
    });

    const { access_token } = await response.json();
    return access_token;
}
```

### Backend: Send Emails with nodemailer

```javascript
const nodemailer = require('nodemailer');

async function sendEmailViaGateway(accessToken, userEmail, emailData) {
    const transporter = nodemailer.createTransporter({
        service: 'gmail',
        auth: {
            type: 'OAuth2',
            user: userEmail,
            accessToken: accessToken
        }
    });

    return await transporter.sendMail({
        from: userEmail,
        to: emailData.to,
        subject: emailData.subject,
        text: emailData.message,
        html: emailData.html
    });
}

// Express route example
app.post('/send-email', async (req, res) => {
    try {
        const { accessToken, userEmail, to, subject, message } = req.body;
        
        const result = await sendEmailViaGateway(accessToken, userEmail, {
            to, subject, message
        });
        
        res.json({ success: true, messageId: result.messageId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

## 🛡️ Complete HTML Example

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>My Website with OAuth</title>
</head>
<body>
    <!-- Login Section (shown when not authenticated) -->
    <div id="login-section">
        <h1>Welcome to My Website</h1>
        <p>Please login to continue:</p>
        <button onclick="loginWithGoogle()" style="padding: 12px 24px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;">
            🔑 Login with Google
        </button>
    </div>

    <!-- User Section (shown when authenticated) -->
    <div id="user-section" style="display: none;">
        <!-- User info populated here -->
    </div>

    <script>
        function loginWithGoogle() {
            const currentUrl = window.location.href;
            window.location.href = `https://oauth.skoonline.org/auth/google/login?redirect_uri=${encodeURIComponent(currentUrl)}`;
        }

        async function loadUserProfile() {
            const token = localStorage.getItem('oauth_token');
            if (!token) return;

            try {
                const response = await fetch('https://oauth.skoonline.org/auth/userinfo', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    const userInfo = await response.json();
                    
                    document.getElementById('user-section').innerHTML = `
                        <h3>Welcome, ${userInfo.user.name}!</h3>
                        <p>📧 ${userInfo.user.email}</p>
                        ${userInfo.user.picture ? `<img src="${userInfo.user.picture}" width="50" height="50" style="border-radius: 25px;">` : ''}
                        <br><br>
                        <button onclick="logout()" style="padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Logout
                        </button>
                    `;
                    
                    document.getElementById('user-section').style.display = 'block';
                    document.getElementById('login-section').style.display = 'none';
                } else {
                    logout();
                }
            } catch (error) {
                console.error('Error loading user info:', error);
                logout();
            }
        }

        function logout() {
            localStorage.removeItem('oauth_token');
            document.getElementById('user-section').style.display = 'none';
            document.getElementById('login-section').style.display = 'block';
        }

        // Handle OAuth callback
        window.onload = function() {
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('token');
            const success = urlParams.get('success');

            if (success && token) {
                localStorage.setItem('oauth_token', token);
                window.history.replaceState({}, document.title, window.location.pathname);
                loadUserProfile();
            } else {
                const existingToken = localStorage.getItem('oauth_token');
                if (existingToken) {
                    loadUserProfile();
                }
            }
        };
    </script>
</body>
</html>
```

## 🔗 API Endpoints Reference

| Endpoint | Method | Purpose | Parameters |
|----------|--------|---------|------------|
| `/auth/google/login` | GET | Start OAuth flow | `redirect_uri` (optional) |
| `/auth/google/callback` | GET | OAuth callback | Handled automatically |
| `/auth/token` | POST | Exchange gateway token for Google token | `gatewayToken`, `provider`, `scope` |
| `/auth/userinfo` | GET | Get user profile | `Authorization: Bearer <token>` |
| `/auth/logout` | DELETE | Revoke tokens | `Authorization: Bearer <token>` |
| `/health` | GET | Check gateway status | None |

## 🎯 Different Integration Patterns

### Pattern 1: Single Page Application (SPA)
```javascript
// Store token and manage state in localStorage
// Handle OAuth callback with URL parameters
// Perfect for React, Vue, Angular apps
```

### Pattern 2: Multi-Page Website
```javascript
// Use cookies or sessionStorage
// Redirect to different pages after login
// Check authentication on each page load
```

### Pattern 3: Backend Integration
```javascript
// Send gateway token to your server
// Server exchanges for Google access tokens
// Use for Gmail SMTP, Google APIs, etc.
```

## ⚙️ Configuration Options

### Custom Return URL
```javascript
// Specify where user returns after OAuth
const returnUrl = 'https://yoursite.com/dashboard';
window.location.href = `https://oauth.skoonline.org/auth/google/login?redirect_uri=${encodeURIComponent(returnUrl)}`;
```

### Request Specific Scopes
```javascript
// Get tokens with specific Google scopes
const response = await fetch('https://oauth.skoonline.org/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        gatewayToken: userToken,
        provider: 'google',
        scope: [
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://mail.google.com/',
            'https://www.googleapis.com/auth/calendar'
        ]
    })
});
```

## 🛠️ Testing Your Integration

### 1. Test Authentication Flow
```javascript
// Check if gateway is accessible
fetch('https://oauth.skoonline.org/health')
    .then(response => response.json())
    .then(data => console.log('Gateway status:', data));
```

### 2. Test Token Exchange
```javascript
// Verify you can get Google access tokens
// Use the /auth/token endpoint with your gateway token
```

### 3. Test Google API Calls
```javascript
// Make sure your access tokens work with Google services
// Test with Google's userinfo API first
```

## 🚨 Important Notes

1. **Domain Security**: The gateway is configured for `skoonline.org` domains
2. **HTTPS Required**: All production integrations must use HTTPS
3. **Token Storage**: Store gateway tokens securely (localStorage, httpOnly cookies, etc.)
4. **Error Handling**: Always handle network errors and token expiration
5. **Scopes**: Only request the Google scopes your application actually needs

## 📞 Support

- **Test your integration**: Use `https://oauth.skoonline.org/oauth-demo.html`
- **Check gateway health**: `https://oauth.skoonline.org/health`
- **View API docs**: `https://oauth.skoonline.org/docs`

## 🎯 Common Use Cases

### Blog/CMS Authentication
```javascript
// Add "Login with Google" to your blog
// Store user info for comments, personalization
```

### E-commerce Integration
```javascript
// Google OAuth for customer accounts
// Access Gmail for order confirmations
```

### SaaS Application
```javascript
// Google OAuth for user onboarding
// Gmail integration for notifications
// Google Calendar integration for scheduling
```

### Email Marketing Platform
```javascript
// Google OAuth for user authentication
// Gmail SMTP for sending campaigns
// Access to user's Gmail for data import
```

**Start integrating in minutes - just add the login button and handle the callback!** 🎉