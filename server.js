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
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not defined in environment variables.');
  }

  // 1. If connection is already open and ready (readyState === 1), reuse it
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  // 2. If disconnected (0) or disconnecting (3), or no connection promise exists, start one
  if (!cached.promise || mongoose.connection.readyState === 0 || mongoose.connection.readyState === 3) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    cached.promise = mongoose.connect(mongoUri, opts).then((mongooseInstance) => {
      console.log('Connected to MongoDB Atlas successfully.');
      return mongooseInstance;
    }).catch((err) => {
      cached.promise = null;
      cached.conn = null;
      console.error('MongoDB connection error:', err.message);
      throw err;
    });
  }

  // 3. Await connection promise so NO request ever proceeds while readyState is 2 (connecting)
  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    cached.conn = null;
    throw err;
  }

  return cached.conn;
}

// Ensure DB is connected on every incoming request
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('Database connection middleware error:', err.message);
    if (req.path.startsWith('/api/') || req.headers.accept?.includes('application/json')) {
      return res.status(503).json({ error: 'Database temporarily unavailable. Please retry.' });
    }
    return res.status(503).render('index', { 
      pageTitle: 'PsychoBandhu', 
      generalQ: null,
      activeQuestions: [], 
      countsMap: {}, 
      featuredResponses: [], 
      flashMessage: 'Database connection is re-establishing. Please refresh in a moment.' 
    });
  }
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
