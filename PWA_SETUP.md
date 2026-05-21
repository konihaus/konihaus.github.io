# Konihaus PWA (Progressive Web App) Setup

This document describes the PWA setup implemented for the Konihaus website.

## Files Added

### 1. **manifest.json**
- Defines the PWA metadata
- Includes app name, icons, colors, and shortcuts
- Supports multiple icon sizes (192px, 512px) with maskable icons for adaptive display
- Defines quick action shortcuts for:
  - Free consultation
  - View packages
  - About Konihaus
- Contains app screenshots for install prompts
- Supports both narrow (mobile) and wide (tablet/desktop) form factors

### 2. **sw.js** (Service Worker)
- Enables offline functionality
- Implements network-first caching strategy
- Caches:
  - HTML, CSS, JavaScript files
  - Translation JSON files
  - Images and fonts
- Falls back to cached content when offline
- Periodically checks for updates
- Gracefully handles failed cache operations

### 3. **.htaccess**
- Configures HTTP headers for optimal caching
- Sets up GZIP compression
- Implements cache control strategies:
  - HTML: 1 hour cache (always validate)
  - CSS/JS: 1 month immutable cache
  - Images: 3 months immutable cache
  - Fonts: 1 year immutable cache
  - Translations/JSON: 1 hour cache
  - Service Worker: No cache (always fresh)
- Enforces HTTPS redirection
- Adds security headers (X-Content-Type-Options, X-Frame-Options, etc.)
- Enables CORS for fonts

### 4. **robots.txt**
- Guides search engine crawlers
- Allows indexing of main content
- Disallows crawling of node_modules and service worker
- Points to sitemap location

### 5. **favicon.svg**
- Standalone SVG favicon file
- Referenced by manifest.json
- Forest green background with house icon

## Features Enabled

### Installation
Users on supported browsers (Chrome, Edge, Firefox, Safari) can install Konihaus as:
- Mobile app (standalone display)
- Desktop app (Windows, macOS, Linux)
- Home screen shortcut (iOS)

**Installation Prompt Triggers:**
- Android: After visiting the site 2-3 times
- iOS: Manual "Add to Home Screen" in Share menu
- Desktop: Manual install from address bar or app menu

### Offline Support
- Core pages accessible offline
- Translations load from cache
- Images and fonts cached automatically
- Graceful fallback message when content unavailable

### App Shortcuts (Android/Desktop)
Users can quick-access:
1. **Kostenlose Beratung** - Jump directly to consultation form
2. **Pakete ansehen** - Browse packages quickly
3. **Über Konihaus** - View company information

### Performance
- Aggressive caching reduces load times on repeat visits
- Service worker updates checked every 60 seconds
- Immutable cache headers for versioned assets
- GZIP compression for text-based content

### Security
- HTTPS enforcement (via .htaccess)
- Security headers prevent XSS and clickjacking
- Controlled CORS for fonts
- Protected sensitive files

## Browser Support

| Browser | Desktop | Mobile |
|---------|---------|--------|
| Chrome | ✅ Full | ✅ Full |
| Edge | ✅ Full | ✅ Full |
| Firefox | ✅ Full | ✅ Full |
| Safari | ✅ Partial | ✅ Partial (iOS 16+) |
| Opera | ✅ Full | ✅ Full |

**Note:** Safari support is limited but improving with iOS 16+

## Testing the PWA

### Test Installation
1. **Chrome/Edge/Firefox (Desktop):**
   - Open DevTools → Application tab
   - Check "Manifest" to verify manifest.json loads
   - Check "Service Workers" to verify sw.js registration

2. **Mobile:**
   - Visit site in Chrome/Edge
   - Look for "Install app" prompt at bottom
   - Or use menu → "Install app"

3. **iOS:**
   - Open in Safari
   - Tap Share → Add to Home Screen

### Test Offline Mode
1. Open DevTools → Application → Service Workers
2. Check "Offline" checkbox
3. Reload page - should work offline
4. Try navigating between sections - should work

### Test Caching
1. Open DevTools → Network tab
2. First load: Check "Size" column - shows downloaded bytes
3. Reload page: Should see "from disk cache" or "(cached)"
4. Check DevTools → Application → Cache Storage for cached files

## Configuration Notes

### Updating the App
- Service worker checks for updates every 60 seconds
- Users automatically get updates without requiring manual refresh
- Manifest version can be incremented when making significant updates

### Deployment Requirements
1. HTTPS enabled (required for service workers)
2. `.htaccess` file support (Apache server required)
3. Proper MIME types configured for JSON and SVG

### If Using Other Web Servers

**Nginx Configuration Example:**
```nginx
# Cache control
location ~* \.(css|js|woff|woff2|ttf|otf|eot)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

location ~* \.(jpg|jpeg|png|gif|svg|webp|ico)$ {
    expires 3m;
    add_header Cache-Control "public, immutable";
}

location ~ \.json$ {
    expires 1h;
    add_header Cache-Control "public, must-revalidate";
}

location ~ /sw\.js$ {
    expires epoch;
    add_header Cache-Control "public, max-age=0, must-revalidate";
}

# Service worker MIME type
types {
    application/javascript js;
    application/manifest+json json;
    image/svg+xml svg;
}
```

## Maintenance

### Regular Tasks
1. **Monitor Service Worker Updates:**
   - Check browser DevTools for error logs
   - Ensure sw.js loads without errors

2. **Update Translations:**
   - When updating translation files, service worker automatically caches them
   - 1-hour cache ensures reasonably fresh content

3. **Version Bumps:**
   - Consider incrementing cache versions if major updates occur
   - Add change log entry in manifest

### Troubleshooting

**Service Worker Not Installing:**
- Check browser console for errors
- Verify HTTPS is enabled
- Ensure sw.js has correct MIME type (application/javascript)
- Check that main.js registration code runs

**Offline Page Not Working:**
- Verify translation files are cached
- Check cache storage in DevTools
- Ensure fallback route points to valid HTML

**Installation Prompt Not Showing:**
- Must be served over HTTPS
- Manifest.json must be valid
- Service worker must be active
- User must visit site multiple times (browser-dependent)

## Resources

- [MDN: Progressive Web Apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [Web.dev: PWA Checklist](https://web.dev/pwa-checklist/)
- [WebAPIs: Service Worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [WebAPIs: Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest)
