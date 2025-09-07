const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const admin = require('firebase-admin');

// Load environment variables
dotenv.config();

const app = express();
const upload = multer({ dest: path.join(__dirname, 'uploads/') });
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Environment variable validation
const requiredEnvVars = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_CLIENT_EMAIL'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.log('⚠️ Missing required environment variables:', missingEnvVars.join(', '));
  console.log('⚠️ Firebase Admin SDK will not be initialized');
} else {
  console.log('✅ All required Firebase environment variables are set');
}

// Initialize Firebase Admin SDK
let db, storage;
try {
  if (missingEnvVars.length === 0) {
    const serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: process.env.FIREBASE_AUTH_URI || "https://accounts.google.com/o/oauth2/auth",
      token_uri: process.env.FIREBASE_TOKEN_URI || "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL || "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`
    });
    
    db = admin.firestore();
    storage = admin.storage();
    console.log('✅ Firebase Admin SDK initialized successfully');
    console.log('✅ Firebase services initialized');
  } else {
    console.log('⚠️ Skipping Firebase initialization due to missing environment variables');
  }
} catch (error) {
  console.log('❌ Firebase Admin SDK initialization failed:', error.message);
  console.log('⚠️ Continuing without Firebase...');
}

// Routes
// Proxy for deleting resume history (moved to correct place)
app.post('/api/resume/history/delete', async (req, res) => {
  try {
    const { userId, docId } = req.body;
    const response = await axios.post('http://localhost:8000/resume/history/delete', { userId, docId });
    res.status(response.status).json(response.data);
  } catch (err) {
    console.error('Error deleting history:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to delete history entry.' });
  }
});
// Resume Analysis History Proxy Route
app.get('/api/resume/history', async (req, res) => {
  try {
    const userId = req.query.userId || 'demoUser';
    const response = await axios.get(`http://localhost:8000/resume/history?userId=${encodeURIComponent(userId)}`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resume Analysis Proxy Route
app.post('/api/resume', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  try {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', fs.createReadStream(req.file.path), req.file.originalname);
    if (req.body.job_description) {
      form.append('job_description', req.body.job_description);
    }
    if (req.body.userId) {
      form.append('userId', req.body.userId);
    }
    const response = await axios.post('http://localhost:8000/analyze-resume', form, {
      headers: form.getHeaders(),
    });
    fs.unlinkSync(req.file.path);
    res.json(response.data);
  } catch (err) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'AI Interview Preparation API',
    version: '1.0.0',
    status: 'running',
    firebase: missingEnvVars.length === 0 ? 'configured' : 'not configured'
  });
});

// Resume upload endpoint
app.post('/uploadResume', async (req, res) => {
  try {
    const { userId, resumeData, fileName } = req.body;
    
    if (!userId || !resumeData) {
      return res.status(400).json({ 
        error: 'Missing required fields: userId and resumeData' 
      });
    }

    // Dummy analysis logic
    const analysisResult = {
      userId,
      fileName: fileName || 'resume.pdf',
      uploadDate: new Date().toISOString(),
      status: 'analyzed',
      score: Math.floor(Math.random() * 40) + 60, // Dummy score 60-100
      feedback: [
        'Resume structure is well-organized',
        'Consider adding more quantifiable achievements',
        'Skills section could be more specific',
        'Overall professional presentation'
      ],
      suggestions: [
        'Add metrics to quantify your impact',
        'Include relevant certifications',
        'Highlight leadership experiences',
        'Optimize for ATS compatibility'
      ]
    };

    res.json({
      success: true,
      message: 'Resume analyzed successfully',
      data: analysisResult
    });
  } catch (error) {
    console.error('Error in resume upload:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Get interview questions endpoint
app.get('/questions', async (req, res) => {
  try {
    const { category, difficulty } = req.query;

    const questions = [
      {
        id: 1,
        category: 'behavioral',
        difficulty: 'medium',
        question: 'Tell me about a time when you had to work with a difficult team member.',
        tips: [
          'Use the STAR method (Situation, Task, Action, Result)',
          'Focus on the positive outcome',
          'Show your problem-solving skills'
        ]
      },
      {
        id: 2,
        category: 'technical',
        difficulty: 'hard',
        question: 'Explain the concept of machine learning to a non-technical person.',
        tips: [
          'Use analogies and real-world examples',
          'Avoid technical jargon',
          'Focus on practical applications'
        ]
      },
      {
        id: 3,
        category: 'situational',
        difficulty: 'easy',
        question: 'How would you handle a tight deadline?',
        tips: [
          'Show your prioritization skills',
          'Mention communication with stakeholders',
          'Highlight your time management abilities'
        ]
      }
    ];

    let filteredQuestions = questions;
    if (category) {
      filteredQuestions = filteredQuestions.filter(q => q.category === category);
    }
    if (difficulty) {
      filteredQuestions = filteredQuestions.filter(q => q.difficulty === difficulty);
    }

    res.json({
      success: true,
      count: filteredQuestions.length,
      data: filteredQuestions
    });
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Submit interview answers endpoint
app.post('/answers', async (req, res) => {
  try {
    const { userId, questionId, answer, audioUrl } = req.body;
    
    if (!userId || !questionId || !answer) {
      return res.status(400).json({ 
        error: 'Missing required fields: userId, questionId, and answer' 
      });
    }

    // Dummy feedback logic
    const feedback = {
      userId,
      questionId,
      answer,
      audioUrl,
      timestamp: new Date().toISOString(),
      score: Math.floor(Math.random() * 30) + 70, // Dummy score 70-100
      feedback: {
        content: [
          'Good use of specific examples',
          'Consider being more concise',
          'Excellent structure in your response'
        ],
        delivery: [
          'Good pace and clarity',
          'Consider varying your tone',
          'Maintain eye contact during video calls'
        ],
        overall: 'Strong response with room for improvement in delivery'
      },
      suggestions: [
        'Practice your response timing',
        'Prepare more specific examples',
        'Work on your confidence indicators'
      ]
    };

    res.json({
      success: true,
      message: 'Answer analyzed successfully',
      data: feedback
    });
  } catch (error) {
    console.error('Error in answer submission:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Get user feedback endpoint
app.get('/feedback/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { type, limit = 10 } = req.query;
    
    if (!userId) {
      return res.status(400).json({ 
        error: 'Missing required parameter: userId' 
      });
    }

    const feedbackHistory = [
      {
        id: 1,
        userId,
        type: 'resume',
        date: new Date(Date.now() - 86400000).toISOString(),
        score: 85,
        summary: 'Resume analysis completed with good feedback'
      },
      {
        id: 2,
        userId,
        type: 'interview',
        date: new Date(Date.now() - 172800000).toISOString(),
        score: 78,
        summary: 'Mock interview completed with improvement suggestions'
      },
      {
        id: 3,
        userId,
        type: 'posture',
        date: new Date(Date.now() - 259200000).toISOString(),
        score: 92,
        summary: 'Posture training session with excellent results'
      }
    ];

    let filteredFeedback = feedbackHistory;
    if (type) {
      filteredFeedback = feedbackHistory.filter(f => f.type === type);
    }

    filteredFeedback = filteredFeedback.slice(0, parseInt(limit));

    res.json({
      success: true,
      count: filteredFeedback.length,
      data: filteredFeedback
    });
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// 404 handler (must come before error middleware)
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'The requested endpoint does not exist'
  });
});

// Error handling middleware (must be last)
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: 'Something went wrong on the server'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}`);
  console.log(`📊 Health Check: http://localhost:${PORT}/`);
  console.log(`🔥 Firebase Status: ${missingEnvVars.length === 0 ? 'Configured' : 'Not Configured'}`);
});