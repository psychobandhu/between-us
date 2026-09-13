const express = require('express');
const router = express.Router();
const apiRouter = express.Router();
const mongoose = require('mongoose');
const xlsx = require('xlsx');
const { Question, Response } = require('../models');

// Hardcoded admin password from environment or default inbox@2026
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'inbox@2026';

// Middleware to guard admin routes
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.redirect('/admin/login');
}

// ----------------- Public Audio Endpoint -----------------
// Dedicated route for streaming and playback of audio buffers
apiRouter.get('/responses/:id/audio', async (req, res) => {
  try {
    const response = await Response.findById(req.params.id);
    if (!response || !response.audio || !response.audio.data) {
      return res.status(404).send('Audio not found');
    }

    const buffer = response.audio.data;
    const total = buffer.length;
    const mimeType = response.audio.mimeType || 'audio/webm';
    const range = req.headers.range;

    // Support HTTP Range requests for Safari and media scrubbing
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType
      });
      res.end(buffer.slice(start, end + 1));
    } else {
      res.writeHead(200, {
        'Content-Length': total,
        'Accept-Ranges': 'bytes',
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=31536000'
      });
      res.end(buffer);
    }
  } catch (err) {
    console.error('Error serving audio:', err);
    res.status(500).send('Error streaming audio');
  }
});

// ----------------- Admin Auth Routes -----------------
router.get('/login', (req, res) => {
  if (req.session && req.session.isAdmin) {
    return res.redirect('/admin');
  }
  res.render('admin-login', { error: null });
});

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  res.render('admin-login', { error: 'Incorrect password. Please try again.' });
});

router.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/admin/login');
});

// All routes below require Admin authentication
router.use(requireAdmin);

// ----------------- Admin Dashboard -----------------
router.get('/', async (req, res) => {
  try {
    await Question.ensureGeneral();
    const questions = await Question.find().sort({ createdAt: -1 });

    // Compute response counts (total and unread) per question
    const questionStats = await Response.aggregate([
      { 
        $group: { 
          _id: '$questionId', 
          total: { $sum: 1 },
          unread: { $sum: { $cond: [{ $eq: ['$isRead', true] }, 0, 1] } }
        } 
      }
    ]);
    const countsMap = {};
    questionStats.forEach(stat => {
      countsMap[stat._id.toString()] = {
        total: stat.total,
        unread: stat.unread
      };
    });

    // Compute MongoDB 512MB free tier storage usage from db.stats()
    let storage = {
      usedMB: '0.00',
      totalMB: 512,
      percentage: '0.0',
      warning: null
    };

    try {
      if (mongoose.connection && mongoose.connection.db) {
        const stats = await mongoose.connection.db.stats();
        // Calculate total allocated/data size in bytes
        const usedBytes = (stats.dataSize || 0) + (stats.indexSize || 0);
        const capBytes = 512 * 1024 * 1024; // 512MB
        const usedMB = (usedBytes / (1024 * 1024)).toFixed(2);
        const percentageNum = Math.min((usedBytes / capBytes) * 100, 100);
        const percentage = percentageNum.toFixed(1);

        let warning = null;
        if (percentageNum >= 90) {
          warning = 'CRITICAL: Database storage is above 90% capacity!';
        } else if (percentageNum >= 80) {
          warning = 'WARNING: Database storage is above 80% capacity!';
        }

        storage = { usedMB, totalMB: 512, percentage, warning };
      }
    } catch (dbErr) {
      console.warn('Could not fetch db.stats():', dbErr.message);
    }

    const host = req.get('host');
    const protocol = req.protocol;
    const baseUrl = `${protocol}://${host}`;

    res.render('admin-dashboard', {
      questions,
      countsMap,
      storage,
      baseUrl,
      createdSlug: req.query.created || null
    });
  } catch (err) {
    console.error('Error in admin dashboard:', err);
    res.status(500).send('Error loading dashboard');
  }
});

// ----------------- Create Question -----------------
router.post('/questions', async (req, res) => {
  try {
    const text = (req.body.text || '').trim();
    if (!text) {
      return res.redirect('/admin');
    }

    const question = await Question.create({ text });
    res.redirect(`/admin?created=${question.slug}`);
  } catch (err) {
    console.error('Error creating question:', err);
    res.status(500).send('Error creating question');
  }
});

// ----------------- Toggle Archive / Live Question -----------------
router.post('/questions/:id/toggle-active', async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).send('Question not found');
    }
    question.isActive = !question.isActive;
    await question.save();

    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.json({ success: true, isActive: question.isActive });
    }

    const redirectUrl = req.headers.referer || '/admin';
    res.redirect(redirectUrl);
  } catch (err) {
    console.error('Error archiving question:', err);
    res.status(500).send('Error updating question status');
  }
});

// ----------------- Delete Question -----------------
router.post('/questions/:id/delete', async (req, res) => {
  try {
    const questionId = req.params.id;
    await Question.findByIdAndDelete(questionId);
    // Remove all associated responses to free storage
    await Response.deleteMany({ questionId });
    res.redirect('/admin');
  } catch (err) {
    console.error('Error deleting question:', err);
    res.status(500).send('Error deleting question');
  }
});

// ----------------- Question Responses View -----------------
router.get('/questions/:id', async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).send('Question not found');
    }

    const responses = await Response.find({ questionId: question._id }).sort({ createdAt: -1 });
    const unreadCount = responses.filter(r => !r.isRead).length;

    const host = req.get('host');
    const protocol = req.protocol;
    const baseUrl = `${protocol}://${host}`;

    res.render('admin-question', {
      question,
      responses,
      unreadCount,
      baseUrl
    });
  } catch (err) {
    console.error('Error loading question responses:', err);
    res.status(500).send('Error loading responses');
  }
});

// ----------------- Mark All Read -----------------
router.post('/questions/:id/mark-all-read', async (req, res) => {
  try {
    await Response.updateMany({ questionId: req.params.id, isRead: false }, { isRead: true });

    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.json({ success: true });
    }

    res.redirect(`/admin/questions/${req.params.id}`);
  } catch (err) {
    console.error('Error marking all read:', err);
    res.status(500).json({ error: 'Failed to mark responses as read' });
  }
});

// ----------------- Read / Unread Toggle -----------------
router.post('/responses/:id/toggle-read', async (req, res) => {
  try {
    const response = await Response.findById(req.params.id);
    if (!response) {
      return res.status(404).json({ error: 'Response not found' });
    }

    response.isRead = !response.isRead;
    await response.save();

    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.json({ success: true, isRead: response.isRead });
    }

    res.redirect(`/admin/questions/${response.questionId}`);
  } catch (err) {
    console.error('Error toggling read status:', err);
    res.status(500).json({ error: 'Failed to toggle read status' });
  }
});

// ----------------- Feature Toggle -----------------
router.post('/responses/:id/toggle-feature', async (req, res) => {
  try {
    const response = await Response.findById(req.params.id);
    if (!response) {
      return res.status(404).json({ error: 'Response not found' });
    }

    response.isFeatured = !response.isFeatured;
    await response.save();

    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.json({ success: true, isFeatured: response.isFeatured });
    }

    res.redirect(`/admin/questions/${response.questionId}`);
  } catch (err) {
    console.error('Error toggling feature:', err);
    res.status(500).json({ error: 'Failed to toggle feature' });
  }
});

// ----------------- Delete Response -----------------
router.post('/responses/:id/delete', async (req, res) => {
  try {
    const response = await Response.findById(req.params.id);
    if (!response) {
      return res.status(404).json({ error: 'Response not found' });
    }

    const questionId = response.questionId;
    await Response.findByIdAndDelete(req.params.id);

    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.json({ success: true });
    }

    res.redirect(`/admin/questions/${questionId}`);
  } catch (err) {
    console.error('Error deleting response:', err);
    res.status(500).json({ error: 'Failed to delete response' });
  }
});

// ----------------- Excel Export -----------------
router.get('/export', async (req, res) => {
  try {
    const { questionId, dateFrom, dateTo } = req.query;

    const filter = {};
    if (questionId) {
      filter.questionId = questionId;
    }

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) {
        filter.createdAt.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        // Set to end of the day
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    const responses = await Response.find(filter)
      .populate('questionId', 'text slug isGeneral')
      .sort({ createdAt: -1 });

    const host = req.get('host');
    const protocol = req.protocol;
    const baseUrl = `${protocol}://${host}`;

    // Build tabular data
    const rows = responses.map(r => {
      const created = new Date(r.createdAt);
      const dateStr = created.toISOString().slice(0, 10);
      const timeStr = created.toTimeString().slice(0, 8);
      const isGeneral = r.questionId && (r.questionId.isGeneral || r.questionId.slug === 'general');
      const questionText = r.questionId 
        ? (isGeneral ? '💭 General Thoughts / Open Inbox' : r.questionId.text) 
        : 'Deleted Question';

      let responseContent = '';
      if (r.type === 'text') {
        responseContent = r.content || '';
      } else {
        responseContent = `[Audio] ${baseUrl}/api/responses/${r._id}/audio (${r.audio?.durationSeconds || 0}s, ${( (r.audio?.sizeBytes || 0) / 1024).toFixed(1)} KB)`;
      }

      return {
        'Category': isGeneral ? 'Open Thought' : 'Question Reply',
        'Question / Context': questionText,
        'Type': r.type === 'audio' ? 'Voice Note' : 'Text Message',
        'Response Content / Audio Link': responseContent,
        'Date': dateStr,
        'Time': timeStr,
        'Featured': r.isFeatured ? 'Yes' : 'No'
      };
    });

    // Create Excel workbook
    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Responses');

    // Auto-size columns slightly
    ws['!cols'] = [
      { wch: 16 }, // Category
      { wch: 35 }, // Question / Context
      { wch: 14 }, // Type
      { wch: 65 }, // Content / Audio
      { wch: 12 }, // Date
      { wch: 10 }, // Time
      { wch: 10 }  // Featured
    ];

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `psychobandhu-export-${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    console.error('Error exporting Excel:', err);
    res.status(500).send('Error generating export');
  }
});

module.exports = router;
module.exports.apiRouter = apiRouter;
