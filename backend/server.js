const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const admin = require('firebase-admin');
// Removed http-proxy-middleware (was triggering util._extend deprecation via http-proxy transitive dependency)
// Native fetch-based proxy implemented below for /api/posture

// Load environment variables
dotenv.config();

const app = express();
const upload = multer({ dest: path.join(__dirname, 'uploads/') });
// Memory storage multer instance for proxying files directly without writing to disk
const uploadMemory = multer({ storage: multer.memoryStorage() });
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

// Internal flags
let postureIndexWarned = false; // avoid spamming console with missing index warning

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

// Post-initialization verification
if (!admin.apps.length) {
  console.error('🚨 Firebase Admin not initialized: no apps registered. Check environment variables and private key formatting.');
} else if (!db) {
  console.error('🚨 Firestore (db) reference not established even though Firebase initialized.');
} else {
  console.log('🔍 Firebase verification: admin app count =', admin.apps.length);
}

// Posture API proxy route - native implementation (no http-proxy-middleware)
// If POSTURE_SERVICE_URL env var is set, use it as-is (should be full URL)
// Otherwise default to localhost. For Render deployment, set env var to just the service name (e.g., "posture-service-xyz")
const POSTURE_SERVICE_URL = process.env.POSTURE_SERVICE_URL 
  ? (process.env.POSTURE_SERVICE_URL.startsWith('http') 
      ? process.env.POSTURE_SERVICE_URL 
      : `https://${process.env.POSTURE_SERVICE_URL}.onrender.com`)
  : 'http://localhost:5001';
app.use('/api/posture', async (req, res, next) => {
  try {
    // Keep local handlers (save-session, history GET, history DELETE) out of proxy
    if (
      (req.path === '/save-session' && req.method === 'POST') ||
      (req.path === '/history' && req.method === 'GET') ||
      (req.path.startsWith('/history/') && req.method === 'DELETE')
    ) {
      return next();
    }

    // Build target URL. All requests to this middleware should go to the single endpoint.
    const targetUrl = `${POSTURE_SERVICE_URL.replace(/\/$/, '')}/api/posture`;
    console.log(`Posture proxy: ${req.method} ${req.path} -> ${targetUrl}`);

    // Clone headers but drop hop-by-hop ones and accept-encoding to avoid decompression issues
    const headers = { ...req.headers };
    delete headers['host'];
    delete headers['connection'];
    delete headers['content-length'];
    // Keep accept-encoding removed to force uncompressed response
    delete headers['accept-encoding'];

    const method = req.method.toUpperCase();
    const fetchOptions = {
      method,
      headers,
      // Add timeout to prevent hanging
      signal: AbortSignal.timeout(120000) // 120 second timeout
    };

    // Because express.json() already consumed body, use req.body for JSON
    if (!['GET', 'HEAD'].includes(method)) {
      if (req.is('application/json')) {
        fetchOptions.body = JSON.stringify(req.body || {});
        fetchOptions.headers['content-type'] = 'application/json';
      } else if (req.is('application/x-www-form-urlencoded')) {
        // Reconstruct form URL encoded body
        const params = new URLSearchParams(req.body || {});
        fetchOptions.body = params.toString();
        fetchOptions.headers['content-type'] = 'application/x-www-form-urlencoded';
      } else if (req.is('multipart/form-data')) {
        // If needed in future: re-stream original multipart (would require disabling body parsing before)
        return res.status(415).json({ error: 'Multipart passthrough not supported in proxy without custom handling.' });
      } else {
        // Fallback: attempt to forward raw body if available
        if (req.body && typeof req.body === 'string') {
          fetchOptions.body = req.body;
        } else {
          fetchOptions.body = JSON.stringify(req.body || {});
          fetchOptions.headers['content-type'] = 'application/json';
        }
      }
    }

    const response = await fetch(targetUrl, fetchOptions);

    // Check if response was successful
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Posture service returned ${response.status}:`, errorText);
      return res.status(response.status).json({ 
        error: 'Posture service error', 
        message: errorText || `Service returned ${response.status}` 
      });
    }

    // Forward status & headers (filter unsafe and encoding-related ones)
    res.status(response.status);
    for (const [k, v] of response.headers) {
      const lowerKey = k.toLowerCase();
      // Skip transfer-encoding, content-encoding, content-length as we'll set them ourselves
      if (['transfer-encoding', 'content-encoding', 'content-length'].includes(lowerKey)) continue;
      res.setHeader(k, v);
    }

    // Stream or buffer response
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json().catch(() => null);
      return res.json(data);
    }
    
    // For non-JSON, get raw buffer
    const arrayBuf = await response.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    res.setHeader('content-length', buf.length);
    return res.end(buf);
  } catch (err) {
    console.error('Posture proxy error:', err.message, err.code, err.name);
    if (!res.headersSent) {
      const statusCode = err.code === 'ECONNREFUSED' ? 503 : (err.name === 'AbortError' ? 504 : 502);
      let message = err.message;
      
      if (err.code === 'ECONNREFUSED') {
        message = 'Posture service is starting up. Please try again in 30 seconds.';
      } else if (err.name === 'AbortError') {
        message = 'Posture service timeout. The service may be overloaded or experiencing issues.';
      } else if (err.message && err.message.includes('fetch')) {
        message = 'Failed to connect to posture service. Please try again.';
      }
      
      res.status(statusCode).json({ 
        error: err.code === 'ECONNREFUSED' ? 'Posture service starting' : 'Bad gateway', 
        message 
      });
    }
  }
});

// Posture session save endpoint (handled locally)
app.post('/api/posture/save-session', async (req, res) => {
  try {
    const { userId, sessionData } = req.body;
    
    if (!userId || !sessionData) {
      return res.status(400).json({ 
        error: 'Missing required fields: userId and sessionData' 
      });
    }

    // Add server timestamp and generate session ID
    const sessionRecord = {
      ...sessionData,
      userId,
      sessionId: `posture_${Date.now()}_${userId.substring(0, 8)}`,
      serverTimestamp: new Date().toISOString(),
      status: 'completed'
    };

    // Save to Firestore if available
    if (db) {
      const docRef = await db.collection('posture_sessions').add(sessionRecord);
      console.log('Posture session saved to Firestore:', docRef.id);
      
      res.json({
        success: true,
        message: 'Posture session saved successfully',
        sessionId: sessionRecord.sessionId,
        docId: docRef.id,
        data: sessionRecord
      });
    } else {
      // Fallback: just return success (could save to file or other storage)
      console.log('Posture session data (Firestore not available):', sessionRecord);
      
      res.json({
        success: true,
        message: 'Posture session processed successfully',
        sessionId: sessionRecord.sessionId,
        data: sessionRecord
      });
    }
  } catch (error) {
    console.error('Error saving posture session:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Interview proxy route
const interviewRouter = require('./routes/interview');
// Attach db to app and router for Firestore access in routes
// Proxy dress analysis to Flask backend: accept imageFile (memory) and forward as multipart/form-data
// Proxy dress analysis to Flask backend: accept 'file' (memory) and forward as multipart/form-data
app.post('/api/proxy-dress-analysis', uploadMemory.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded (expected field name 'file')" });

    // Build multipart form with the buffer
    const FormData = require('form-data');
    const form = new FormData();
    // Forward as 'image' for Gemini service compatibility
    form.append('image', req.file.buffer, {
      filename: req.file.originalname || 'upload.jpg',
      contentType: req.file.mimetype || 'image/jpeg'
    });

    // Forward to Flask analyze-dress endpoint
    // If env var starts with http, use as-is; otherwise assume it's a Render service name
    const flaskUrl = process.env.DRESSING_SERVICE_URL 
      ? (process.env.DRESSING_SERVICE_URL.startsWith('http') 
          ? `${process.env.DRESSING_SERVICE_URL}/analyze-dress`
          : `https://${process.env.DRESSING_SERVICE_URL}.onrender.com/analyze-dress`)
      : 'http://localhost:5002/analyze-dress';
    // Increase timeout to 120s to match backend LLM request timeout and avoid
    // client-side cancellations for longer model generations.
    const response = await axios.post(flaskUrl, form, { headers: form.getHeaders(), timeout: 120_000 });

    // Forward Flask response JSON back to client
    if (response && response.data) {
      return res.status(response.status || 200).json(response.data);
    }
    // If no JSON data, return 502
    return res.status(502).json({ error: 'Bad gateway: empty response from analysis service' });
  } catch (err) {
    console.error('Error proxying dress analysis:', err.message);
    const statusCode = err.response?.status || (err.code === 'ECONNREFUSED' ? 503 : 500);
    if (err.response && err.response.data) {
      // Forward error from Flask if available
      return res.status(statusCode).json(err.response.data);
    }
    return res.status(statusCode).json({ 
      error: 'Dress analysis service unavailable', 
      message: err.code === 'ECONNREFUSED' ? 'Service is starting up. Please try again in 30 seconds.' : err.message 
    });
  }
});

// Dress session save endpoint (mirrors posture save logic)
app.post('/api/dress/save-session', async (req, res) => {
  try {
    const { userId, sessionData } = req.body;
    if (!userId || !sessionData) return res.status(400).json({ error: 'Missing required fields: userId and sessionData' });

    const sessionRecord = {
      ...sessionData,
      userId,
      sessionId: `dress_${Date.now()}_${userId.substring(0,8)}`,
      serverTimestamp: new Date().toISOString(),
      status: 'completed'
    };

    if (db) {
      const docRef = await db.collection('dress_sessions').add(sessionRecord);
      console.log('Dress session saved to Firestore:', docRef.id);
      return res.json({ success: true, message: 'Dress session saved', docId: docRef.id, data: sessionRecord });
    }

    console.log('Dress session (Firestore not configured):', sessionRecord);
    return res.json({ success: true, message: 'Dress session processed (no Firestore)', data: sessionRecord });
  } catch (err) {
    console.error('Error saving dress session:', err);
    return res.status(500).json({ error: 'Failed to save dress session', message: err.message });
  }
});

// Dress session history endpoint
app.get('/api/dress/history', async (req, res) => {
  try {
    const { userId, limit = 50 } = req.query;
    if (!userId) return res.status(400).json({ error: 'Missing required query param: userId' });
    if (!db) {
      console.log(`Dress history requested (no Firestore) for userId=${userId}`);
      return res.json({ success: true, count: 0, data: [] });
    }

    const max = Number(limit) || 50;
    let sessions = [];
    try {
      const snapshot = await db.collection('dress_sessions')
        .where('userId', '==', userId)
        .orderBy('serverTimestamp', 'desc')
        .limit(max)
        .get();
      sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log(`Dress history: Returned ${sessions.length} records for userId=${userId}`);
    } catch (err) {
      if (err && (err.code === 9 || err.code === 'FAILED_PRECONDITION')) {
        if (!postureIndexWarned) { console.warn('Missing index for dress history; falling back to client sort'); postureIndexWarned = true; }
        const snapshot = await db.collection('dress_sessions').where('userId', '==', userId).get();
        sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
          .sort((a,b) => (b.serverTimestamp || '').localeCompare(a.serverTimestamp || '')).slice(0, max);
        console.log(`Dress history: Returned ${sessions.length} records for userId=${userId} (fallback)`);
        return res.json({ success: true, count: sessions.length, data: sessions, fallbackUsed: true });
      } else {
        throw err;
      }
    }

    return res.json({ success: true, count: sessions.length, data: sessions, fallbackUsed: false });
  } catch (err) {
    console.error('Error fetching dress history:', err);
    return res.status(500).json({ error: 'Failed to fetch dress history', message: err.message });
  }
});

// Delete dress session
app.delete('/api/dress/history/:docId', async (req, res) => {
  const { docId } = req.params;
  console.log(`DressDelete: Received delete request docId=${docId}`);
  try {
    if (!docId) return res.status(400).json({ error: 'Missing docId' });
    if (!db) { console.warn('DressDelete: Firestore not configured; returning success (dev mode)'); return res.json({ success: true, docId, warning: 'Firestore not configured' }); }
    const docRef = db.collection('dress_sessions').doc(docId);
    const snap = await docRef.get();
    if (!snap.exists) {
      console.warn(`DressDelete: docId=${docId} not found; returning success for idempotency`);
      return res.json({ success: true, docId, warning: 'Session not found (idempotent delete)' });
    }
    await docRef.delete();
    console.log(`DressDelete: Deleted docId=${docId}`);
    return res.json({ success: true, docId });
  } catch (err) {
    console.error('DressDelete: Error deleting:', err);
    return res.status(500).json({ error: 'Failed to delete dress session', message: err.message });
  }
});
// Also accept POST-based delete for clients that can't issue DELETE (frontend uses this)
app.post('/api/dress/history/delete', async (req, res) => {
  try {
    const { userId, docId } = req.body;
    console.log(`DressDeletePOST: Received delete request userId=${userId} docId=${docId}`);
    if (!docId) return res.status(400).json({ error: 'Missing docId' });
    // Mirror behavior of DELETE endpoint
    if (!db) {
      console.warn('DressDeletePOST: Firestore not configured; returning success (dev mode)');
      return res.json({ success: true, docId, warning: 'Firestore not configured' });
    }

    const docRef = db.collection('dress_sessions').doc(docId);
    const snap = await docRef.get();
    if (snap.exists) {
      await docRef.delete();
      console.log(`DressDeletePOST: Deleted docId=${docId}`);
      return res.json({ success: true, docId });
    }

    // Attempt delete by sessionId field if direct doc id not found
    const querySnapshot = await db.collection('dress_sessions').where('sessionId', '==', docId).limit(1).get();
    if (!querySnapshot.empty) {
      const matchedDoc = querySnapshot.docs[0];
      await matchedDoc.ref.delete();
      console.log(`DressDeletePOST: Deleted by sessionId=${docId} (docId=${matchedDoc.id})`);
      return res.json({ success: true, docId: matchedDoc.id, deletedBy: 'sessionId' });
    }

    console.warn(`DressDeletePOST: docId/sessionId=${docId} not found; returning success for idempotency`);
    return res.json({ success: true, docId, warning: 'Session not found (idempotent delete)' });
  } catch (err) {
    console.error('DressDeletePOST: Error deleting:', err);
    return res.status(500).json({ error: 'Failed to delete dress session', message: err.message });
  }
});
if (db) {
  app.set('db', db);
  interviewRouter.db = db;
}
app.use('/api/interview', interviewRouter);

// Routes
// Resume Analysis History - Get
app.get('/api/resume/history', async (req, res) => {
  const userId = req.query.userId || 'demoUser';
  if (!db) {
    console.warn('Resume history: Firestore not initialized');
    return res.json([]);
  }
  try {
    const snapshot = await db.collection('resume_analysis')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .get();
    
    const history = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      history.push({
        docId: doc.id,
        analysisId: doc.id,
        timestamp: data.timestamp?.toDate?.()?.toISOString() || data.timestamp || new Date().toISOString(),
        score: data.score || 0,
        similarity_with_jd: data.similarity_with_jd || 0,
        ats_score: data.ats_score || 0,
      });
    });
    console.log(`Resume history: Returned ${history.length} records for userId=${userId}`);
    res.json(history);
  } catch (err) {
    console.error('Resume history: Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Resume Analysis History - Delete
app.post('/api/resume/history/delete', async (req, res) => {
  const { userId, docId } = req.body;
  if (!db) {
    return res.status(503).json({ error: 'Firestore not available' });
  }
  try {
    const docRef = db.collection('resume_analysis').doc(docId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const data = doc.data();
    if (data.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    await docRef.delete();
    console.log(`Resume history: Deleted document ${docId} for user ${userId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Resume history delete: Error:', err);
    res.status(500).json({ error: 'Failed to delete history entry.' });
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
    // If env var starts with http, use as-is; otherwise assume it's a Render service name
    const resumeServiceUrl = process.env.RESUME_SERVICE_URL 
      ? (process.env.RESUME_SERVICE_URL.startsWith('http') 
          ? `${process.env.RESUME_SERVICE_URL}/analyze-resume`
          : `https://${process.env.RESUME_SERVICE_URL}.onrender.com/analyze-resume`)
      : 'http://localhost:5003/analyze-resume';
    const response = await axios.post(resumeServiceUrl, form, {
      headers: form.getHeaders(),
      timeout: 120000 // 120 second timeout for cold starts
    });
    fs.unlinkSync(req.file.path);
    res.json(response.data);
  } catch (err) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('Resume analysis error:', err.message);
    const statusCode = err.response?.status || 500;
    res.status(statusCode).json({ 
      error: 'Resume analysis failed', 
      message: err.message,
      details: err.response?.data || 'Service unavailable. Please try again later.'
    });
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
// Posture session history endpoint (must be before 404 handler)
app.get('/api/posture/history', async (req, res) => {
  try {
    const { userId, limit = 50 } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'Missing required query param: userId' });
    }

    if (!db) {
      console.log(`Posture history requested (no Firestore available) for userId=${userId}`);
      return res.json({ success: true, count: 0, data: [] });
    }
    const max = Number(limit) || 50;
    let sessions = [];
    try {
      // Primary query requiring composite index
      const snapshot = await db.collection('posture_sessions')
        .where('userId', '==', userId)
        .orderBy('serverTimestamp', 'desc')
        .limit(max)
        .get();
      sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      // Firestore missing index error code is 9 (FAILED_PRECONDITION)
      if (err && (err.code === 9 || err.code === 'FAILED_PRECONDITION')) {
        if (!postureIndexWarned) {
          console.warn('Missing composite index for posture history. Falling back to client-side sort. Deploy the index for optimal performance. (This will only log once)');
          postureIndexWarned = true;
        }
        const snapshot = await db.collection('posture_sessions')
          .where('userId', '==', userId)
          .get();
        sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
          .sort((a,b) => {
            // ISO date strings compare lexicographically
            return (b.serverTimestamp || '').localeCompare(a.serverTimestamp || '');
          })
          .slice(0, max);
        console.log(`Posture history: Returned ${sessions.length} records for userId=${userId} (fallback)`);
        return res.json({ success: true, count: sessions.length, data: sessions, fallbackUsed: true });
      } else {
        throw err;
      }
    }

    console.log(`Posture history: Returned ${sessions.length} records for userId=${userId}`);
    res.json({ success: true, count: sessions.length, data: sessions, fallbackUsed: false });
  } catch (error) {
    console.error('Error fetching posture history:', error);
    res.status(500).json({ error: 'Failed to fetch posture history', message: error.message });
  }
});

// Delete a posture session by Firestore document id (diagnostic logging)
app.delete('/api/posture/history/:docId', async (req, res) => {
  const { docId } = req.params;
  console.log(`PostureDelete: Received delete request docId=${docId}`);
  try {
    if (!docId) {
      console.error('PostureDelete: Missing docId in params');
      return res.status(400).json({ error: 'Missing docId' });
    }
    // If Firestore is not configured, treat delete as a no-op but return success
    // so local development without Firebase doesn't surface a UI error.
    if (!db) {
      console.warn('PostureDelete: Firestore not configured. Skipping remote delete and returning success (dev mode).');
      return res.json({ success: true, docId, warning: 'Firestore not configured; nothing deleted on server' });
    }

    // Try direct document id delete first
    let docRef = db.collection('posture_sessions').doc(docId);
    let snap = await docRef.get();
    if (snap.exists) {
      await docRef.delete();
      console.log(`PostureDelete: Deleted posture session docId=${docId}`);
      return res.json({ success: true, docId });
    }

    // If the doc with that id doesn't exist, it's possible the frontend passed
    // the sessionId (generated by the app) instead of the Firestore document id.
    // Try to find a matching document by 'sessionId' field and delete it.
    console.log(`PostureDelete: No direct doc id match for ${docId}; attempting field lookup by sessionId`);
    const querySnapshot = await db.collection('posture_sessions').where('sessionId', '==', docId).limit(1).get();
    if (!querySnapshot.empty) {
      const matchedDoc = querySnapshot.docs[0];
      await matchedDoc.ref.delete();
      console.log(`PostureDelete: Deleted posture session by sessionId=${docId} (docId=${matchedDoc.id})`);
      return res.json({ success: true, docId: matchedDoc.id, deletedBy: 'sessionId' });
    }

    console.warn(`PostureDelete: Session not found docId=${docId} (no doc and no matching sessionId)`);
    return res.status(404).json({ error: 'Session not found', docId });
  } catch (err) {
    console.error(`PostureDelete: Error deleting docId=${docId}:`, err);
    return res.status(500).json({ error: 'Failed to delete posture session', message: err.message, docId });
  }
});

// Interview session history endpoint (similar fallback logic to posture history)
app.get('/api/interview/history', async (req, res) => {
  try {
    const { userId, limit = 50 } = req.query;
    if (!userId) return res.status(400).json({ error: 'Missing required query param: userId' });
    if (!db) return res.json({ success: true, count: 0, sessions: [], fallbackUsed: true });

    const max = Number(limit) || 50;
    let sessions = [];
    let fallbackUsed = false;
    try {
      // Primary query (may need composite index userId + startedAt DESC)
      const snapshot = await db.collection('interview_sessions')
        .where('userId', '==', userId)
        .orderBy('startedAt', 'desc')
        .limit(max)
        .get();
      sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      if (err && (err.code === 9 || err.code === 'FAILED_PRECONDITION')) {
        if (!postureIndexWarned) { // reuse throttle flag
          console.warn('Missing composite index for interview history. Falling back to client-side sort. Deploy index for performance.');
          postureIndexWarned = true; // reuse so we log once across both types
        }
        const snapshot = await db.collection('interview_sessions')
          .where('userId', '==', userId)
          .get();
        sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
          .sort((a,b) => {
            const av = (b.startedAt || a.startedAt || {});
            const aTime = a.startedAt?.toDate ? a.startedAt.toDate().getTime() : (a.startedAt?._seconds ? a.startedAt._seconds * 1000 : new Date(a.startedAt || 0).getTime());
            const bTime = b.startedAt?.toDate ? b.startedAt.toDate().getTime() : (b.startedAt?._seconds ? b.startedAt._seconds * 1000 : new Date(b.startedAt || 0).getTime());
            return bTime - aTime;
          })
          .slice(0, max);
        fallbackUsed = true;
      } else {
        throw err;
      }
    }

    // Attach question counts (avoid full subcollection expansion for performance)
    // If you need full questions, the existing router (interview.js) handles that
    console.log(`Interview history: Returned ${sessions.length} records for userId=${userId} fallback=${fallbackUsed}`);
    res.json({ success: true, count: sessions.length, sessions, fallbackUsed });
  } catch (error) {
    console.error('Error fetching interview history:', error);
    res.status(500).json({ error: 'Failed to fetch interview history', message: error.message });
  }
});

// Delete interview session (shallow delete - does not remove questions subcollection here)
app.delete('/api/interview/history/:docId', async (req, res) => {
  const { docId } = req.params;
  console.log(`InterviewDelete: Received delete request docId=${docId}`);
  try {
    if (!docId) return res.status(400).json({ error: 'Missing docId' });
    if (!db) return res.status(503).json({ error: 'Firestore not configured' });
    const ref = db.collection('interview_sessions').doc(docId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Session not found', docId });
    // Optional: delete subcollection 'questions'
    try {
      const questionsSnap = await ref.collection('questions').get();
      const batch = db.batch();
      questionsSnap.forEach(q => batch.delete(q.ref));
      await batch.commit();
    } catch (subErr) {
      console.warn('InterviewDelete: Failed to delete some questions (continuing):', subErr.message);
    }
    await ref.delete();
    console.log(`InterviewDelete: Deleted interview session docId=${docId}`);
    res.json({ success: true, docId });
  } catch (err) {
    console.error(`InterviewDelete: Error deleting docId=${docId}:`, err);
    res.status(500).json({ error: 'Failed to delete interview session', message: err.message, docId });
  }
});

// 404 handler (must come before error middleware and AFTER all valid routes)
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

// Start server (after routes are defined)
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}`);
  console.log(`📊 Health Check: http://localhost:${PORT}/`);
  console.log(`🔥 Firebase Status: ${missingEnvVars.length === 0 ? 'Configured' : 'Not Configured'}`);
});
