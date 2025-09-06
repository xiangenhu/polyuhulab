# DRY Implementation - Shared Components System

This document explains the DRY (Don't Repeat Yourself) approach implemented for the Hu Lab website.

## Overview

Instead of duplicating navigation bars, headers, footers, and other common elements across every HTML file, we now use a shared component system that:

1. **Eliminates code duplication**
2. **Makes maintenance easier** - update once, changes everywhere
3. **Ensures consistency** across all pages
4. **Reduces file sizes** and load times

## Components Created

### 1. Shared Components
- `components/navigation.html` - Common navigation bar
- `components/header.html` - Common HTML head elements  
- `components/footer.html` - Common footer
- `components/floating-elements.html` - Background floating elements

### 2. JavaScript Utilities
- `shared-components.js` - Component loading utilities
- Enhanced `shared-app.js` - Includes component loading functions

### 3. Template System
- `template.html` - Base template for new pages
- `index-dry.html` - Example of DRY implementation

## Usage

### For New Pages
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <title>Your Page - Hu Lab @ PolyU</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="shared-styles.css">
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <script src="shared-components.js"></script>
</head>
<body>
    <!-- Floating elements container -->
    <div id="floating-elements-container"></div>

    <!-- Navigation container -->
    <div id="navigation-container"></div>

    <!-- Your page content here -->
    <main>
        <h1>Your Page Content</h1>
    </main>

    <!-- Footer container -->
    <div id="footer-container"></div>

    <script src="shared-app.js"></script>
</body>
</html>
```

### Automatic Loading
The components are automatically loaded when the page loads via:
- `shared-app.js` includes component loading
- Navigation active state is automatically set based on current page

### Manual Loading (if needed)
```javascript
// Load specific component
await loadComponent('#navigation-container', 'components/navigation.html');

// Set active navigation
setActiveNavigation();

// Initialize all components
await initializeSharedComponents();
```

## Benefits

1. **Maintenance**: Change navigation once in `components/navigation.html`, affects all pages
2. **Consistency**: All pages automatically have identical navigation, footer, etc.
3. **Performance**: Smaller individual HTML files
4. **Scalability**: Easy to add new pages using the template
5. **Active States**: Navigation automatically highlights current page

## File Structure
```
views/
├── components/
│   ├── navigation.html
│   ├── header.html
│   ├── footer.html
│   └── floating-elements.html
├── shared-components.js
├── shared-app.js
├── template.html
└── index-dry.html (example)
```

## Migration

To migrate existing pages:
1. Replace hardcoded navigation with `<div id="navigation-container"></div>`
2. Replace hardcoded footer with `<div id="footer-container"></div>`
3. Replace floating elements with `<div id="floating-elements-container"></div>`
4. Add `<script src="shared-components.js"></script>` to head
5. Remove duplicate head elements that are now in components

This DRY approach significantly reduces code duplication and makes the site much easier to maintain!