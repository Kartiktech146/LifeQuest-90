# LifeQuest 90 — Cross-platform app guide

This update converts LifeQuest 90 into an installable Progressive Web App
(PWA). The same deployed HTTPS website can be installed on Android, iPhone,
iPad, Windows, macOS and Linux.

## 1. Copy the update

Extract the ZIP in the root of your existing `LifeQuest-90` project. Allow it
to replace `app/layout.tsx` and `app/globals.css`.

The update adds:

- Web app manifest and install metadata
- Android, iOS and Windows app icons
- Service worker and offline fallback
- iPhone notch/safe-area support
- Standalone app display mode

API routes, OTP, Quest AI and private user data are not cached by the service
worker. They still require an internet connection and your deployed backend.

## 2. Test locally

```powershell
npm install
npm run lint
npm run build
npm run dev
```

Open `http://localhost:5173`. Browser installation can be tested on localhost,
but installation on other phones requires a deployed HTTPS address.

## 3. Commit and push

```powershell
git add app/layout.tsx app/pwa-register.tsx app/globals.css public/manifest.webmanifest public/sw.js public/offline.html public/icons PWA_INSTALL_GUIDE.md
git commit -m "Add cross-platform PWA support"
git push origin main
```

Never commit `.env.local`, API keys, OAuth secrets, refresh tokens or Twilio
credentials.

## 4. Deploy

Deploy the complete full-stack project to a host that supports its Cloudflare
Worker and D1 configuration. Add production secrets in the hosting dashboard,
not in GitHub.

The final URL must use HTTPS. Test these URLs after deployment:

- `https://YOUR-DOMAIN/manifest.webmanifest`
- `https://YOUR-DOMAIN/sw.js`
- `https://YOUR-DOMAIN/icons/icon-512.png`

## 5. Install on each platform

### Android

Open the deployed URL in Chrome, open the browser menu, and select
**Install app** or **Add to Home screen**.

### iPhone or iPad

Open the deployed URL in Safari, tap **Share**, choose **Add to Home Screen**,
then tap **Add**.

### Windows

Open the deployed URL in Microsoft Edge or Google Chrome and select the
**Install app** icon in the address bar or browser menu.

## Android APK/AAB later

An APK is Android-only; it cannot run on iOS or Windows. After the PWA is
deployed and tested, Bubblewrap or PWABuilder can wrap the same PWA as an
Android APK/AAB. Use an AAB for Google Play publishing and keep the signing
keystore backed up securely.

Official references:

- https://web.dev/learn/pwa/
- https://developer.chrome.com/docs/android/trusted-web-activity/quick-start
- https://developer.android.com/guide/app-bundle/faq
