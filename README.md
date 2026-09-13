# PsychoBandhu — Between Us

Anonymous question and voice/text response web application built with a modern, ultra-clean UI, minimal dependencies, and ready for instant **Vercel** or **Replit** deployment.

## Tech Stack
- **Backend:** Node.js + Express (Serverless ready via `api/index.js` & `vercel.json`)
- **Frontend:** Server-rendered EJS templates + modern vanilla JavaScript
- **Styling:** Modern, dark-mode CSS with glassmorphism and tactile button feedback (`public/style.css`)
- **Database:** MongoDB Atlas Free Tier (with 512MB storage cap monitoring via `db.stats()`)
- **Audio:** Native browser `MediaRecorder` (Opus/WebM, 60s max) saved directly as raw Buffer with HTTP Range streaming
- **Card Generator:** 1080x1920 Instagram Story PNG export with balanced Question & Response layout via `html2canvas`

---



---



---

## Running Locally

1. Open a terminal in this directory:
   ```bash
   npm install
   npm start
   ```
2. Open [http://localhost:3000](http://localhost:3000).

---

## Admin Access
- Access URL: `http://localhost:3000/admin` (or `https://<your-domain>/admin`)
- Also accessible via the discreet **Admin** link at the bottom of the footer.
- Password: `inbox@2026`
