const mongoose = require('mongoose');
const crypto = require('crypto');

const QuestionSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    default: () => crypto.randomBytes(4).toString('hex')
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isGeneral: {
    type: Boolean,
    default: false
  }
});

QuestionSchema.statics.ensureGeneral = async function() {
  let generalQ = await this.findOne({ slug: 'general' });
  if (!generalQ) {
    generalQ = await this.create({
      text: 'General Thoughts',
      slug: 'general',
      isActive: true,
      isGeneral: true
    });
  } else if (!generalQ.isGeneral) {
    generalQ.isGeneral = true;
    await generalQ.save();
  }
  return generalQ;
};

const ResponseSchema = new mongoose.Schema({
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['text', 'audio'],
    required: true
  },
  content: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  audio: {
    data: Buffer,
    mimeType: String,
    durationSeconds: Number,
    sizeBytes: Number
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  isFeatured: {
    type: Boolean,
    default: false,
    index: true
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true
  }
});

const Question = mongoose.model('Question', QuestionSchema);
const Response = mongoose.model('Response', ResponseSchema);

module.exports = { Question, Response };
