# Spendio – Expense Tracker

Spendio is a clean, modern, and completely local-first expense tracking application designed with a beautiful Apple iOS & EdTech aesthetics.

## 🚀 Features

- **Dynamic Dashboard:** Visualize your money with donut and bar charts.
- **Offline First & Cloud Sync:** All data is saved on your device first with seamless Google Firestore cloud backup.
- **Progressive Web App (PWA) & Native Android App:** Available both as installable PWA and native Android APK.
- **Zero-setup Auto Updates:** When installed, updates made to the remote code are automatically fetched and applied.
- **Data Exporting:** Export summaries as JSON, CSV, High-Res Images, or Full Backup (.spendio).
- **Currency Support:** Defaults to `Taka` but fully configurable.

## 📲 How to Install the App (Android / iOS)

You don't need Android Studio or the Play Store. Spendio is a true **PWA (Progressive Web App)**, meaning it packages itself into an app directly from the browser, or you can download the ready **Spendio-v1.3.apk** release!

1. Host this project on **GitHub Pages** (or any static hosting).
2. Open the URL in your phone's browser (Chrome or Safari).
3. The app will detect it's compatible.
4. Tap the **"📲 Install App"** button in the sidebar (or your browser will prompt you "Add to Home Screen").
5. Confim install! The app is now an icon on your homescreen, works exactly like a native app, and launches seamlessly without browser UI.

### 🔄 Auto-Updates

Anytime you push changes to your GitHub (`style.css` tweaks, new features in `app.js`), the installed app on your phone will download the update silently in the background and pop a toast notification letting you know the update is applied!

## 💻 Tech Stack

- Vanilla HTML / CSS / JS
- Canvas API for Charts
- html2canvas for Image Exports
- Service Workers & Web Manifest for Native App installation

## 👨‍💻 Local Development

Clone the project and open `index.html` in your browser. (Note: For the service worker to cache correctly locally, run it over a local server like Live Server).
