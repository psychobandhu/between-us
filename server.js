require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cookieSession = require('cookie-session');
const path = require('path');

const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Cached MongoDB Connection for local & Vercel serverless
let isConnected = false;
async function connectDB() {
  if (isConnected || mongoose.connection.readyState >= 1) {
    return;
  }
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGODB_URI is not defined in environment variables.');
    return;
  }
  try {
    await mongoose.connect(mongoUri, {
      bufferCommands: false,
    });
    isConnected = true;
    console.log('Connected to MongoDB Atlas successfully.');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
  }
}

// Connect immediately on startup
connectDB();

// Ensure DB is connected on every incoming request (crucial for Vercel cold starts)
app.use(async (req, res, next) => {
  await connectDB();
  next();
});

// Middleware
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.json({ limit: '20mb' }));

// Cookie-based session for Admin authentication
app.use(cookieSession({
  name: 'pb_session',
  keys: [process.env.SESSION_SECRET || 'psychobandhu_default_secret_key'],
  maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
}));

// Static files & View Engine
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Mount Routes
app.use('/', publicRoutes);
app.use('/admin', adminRoutes);

// Audio dedicated streaming/playback endpoint
app.use('/api', adminRoutes.apiRouter);

// 404 Handler
app.use((req, res) => {
  res.status(404).render('index', { 
    pageTitle: '404 - Not Found',
    activeQuestions: [],
    countsMap: {},
    featuredResponses: [],
    flashMessage: 'The page you are looking for does not exist.' 
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).send('Internal Server Error');
});

// Start listening if not running inside a Vercel serverless environment
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`PsychoBandhu server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
