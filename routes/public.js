const express = require('express');
const router = express.Router();
const multer = require('multer');
const { Question, Response } = require('../models');

// Configure multer for memory storage (max 15MB for audio recording)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

// Ensure permanent General Thoughts question exists
async function ensureGeneralQuestion() {
  try {
    return await Question.ensureGeneral();
  } catch (err) {
    console.error('Error ensuring general question:', err.message);
  }
}

// Shortcut to open thoughts inbox
router.get('/general', async (req, res) => {
  await ensureGeneralQuestion();
  res.redirect('/q/general');
});

// Welcoming Homepage
router.get('/', async (req, res) => {
  try {
    const generalQ = await ensureGeneralQuestion();

    // Fetch active specific prompt questions (excluding general)
    const activeQuestions = await Question.find({ isActive: true, slug: { $ne: 'general' } }).sort({ createdAt: -1 });

    // Fetch response counts for each question
    const questionStats = await Response.aggregate([
      { $group: { _id: '$questionId', count: { $sum: 1 } } }
    ]);
    const countsMap = {};
    questionStats.forEach(stat => {
      countsMap[stat._id.toString()] = stat.count;
    });

    // Fetch recent featured responses to highlight on homepage
    const featuredResponses = await Response.find({ isFeatured: true })
      .populate('questionId', 'text slug isGeneral')
      .sort({ createdAt: -1 })
      .limit(6);

    res.render('index', { 
      pageTitle: 'PsychoBandhu — Between Us',
      generalQ,
      activeQuestions,
      countsMap,
      featuredResponses,
      flashMessage: null
    });
  } catch (err) {
    console.error('Error loading homepage:', err);
    res.status(500).render('index', { 
      pageTitle: 'PsychoBandhu', 
      generalQ: null,
      activeQuestions: [], 
      countsMap: {}, 
      featuredResponses: [], 
      flashMessage: 'Something went wrong.' 
    });
  }
});

// Dedicated Featured Responses Page
router.get('/featured', async (req, res) => {
  try {
    const featuredResponses = await Response.find({ isFeatured: true })
      .populate('questionId', 'text slug')
      .sort({ createdAt: -1 });

    res.render('featured', {
      pageTitle: 'Featured Responses — PsychoBandhu',
      featuredResponses
    });
  } catch (err) {
    console.error('Error loading featured page:', err);
    res.status(500).send('Error loading featured responses');
  }
});

// Public Question Page
router.get('/q/:slug', async (req, res) => {
  try {
    const question = await Question.findOne({ slug: req.params.slug });
    if (!question) {
      return res.status(404).render('index', {
        pageTitle: 'Question Not Found',
        activeQuestions: [],
        countsMap: {},
        featuredResponses: [],
        flashMessage: 'This question was not found.'
      });
    }

    // Fetch featured responses for this specific question
    const featuredResponses = await Response.find({
      questionId: question._id,
      isFeatured: true
    }).sort({ createdAt: -1 });

    res.render('question', {
      question,
      isArchived: question.isActive === false,
      featuredResponses,
      successMessage: req.query.sent === 'true' ? 'Your anonymous message was sent!' : null
    });
  } catch (err) {
    console.error('Error loading question:', err);
    res.status(500).send('Server Error');
  }
});

// Submit Text Response
router.post('/q/:slug/reply', async (req, res) => {
  try {
    const question = await Question.findOne({ slug: req.params.slug, isActive: true });
    if (!question) {
      return res.status(404).json({ error: 'Question not found or inactive.' });
    }

    const content = (req.body.content || '').trim();
    if (!content) {
      if (req.xhr || req.headers.accept?.includes('json')) {
        return res.status(400).json({ error: 'Please enter a message.' });
      }
      return res.redirect(`/q/${question.slug}`);
    }

    // Cap at 500 characters
    const trimmedContent = content.substring(0, 500);

    await Response.create({
      questionId: question._id,
      type: 'text',
      content: trimmedContent
    });

    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.json({ success: true, message: 'Message sent anonymously!' });
    }

    res.redirect(`/q/${question.slug}?sent=true`);
  } catch (err) {
    console.error('Error submitting text reply:', err);
    res.status(500).json({ error: 'Failed to send message.' });
  }
});

// Submit Voice Response
router.post('/q/:slug/reply-audio', upload.single('audio'), async (req, res) => {
  try {
    const question = await Question.findOne({ slug: req.params.slug, isActive: true });
    if (!question) {
      return res.status(404).json({ error: 'Question not found or inactive.' });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No audio recorded.' });
    }

    const durationSeconds = Math.min(parseInt(req.body.duration || '0', 10), 60);

    await Response.create({
      questionId: question._id,
      type: 'audio',
      audio: {
        data: req.file.buffer,
        mimeType: req.file.mimetype || 'audio/webm',
        durationSeconds: durationSeconds,
        sizeBytes: req.file.size
      }
    });

    res.json({ success: true, message: 'Voice message sent anonymously!' });
  } catch (err) {
    console.error('Error submitting voice reply:', err);
    res.status(500).json({ error: 'Failed to send voice message.' });
  }
});

module.exports = router;
