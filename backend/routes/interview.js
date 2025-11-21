const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const MOCK_INTERVIEW_FLASK_URL = process.env.MOCK_INTERVIEW_SERVICE_URL 
  ? `https://${process.env.MOCK_INTERVIEW_SERVICE_URL}.onrender.com` 
  : 'http://localhost:5004';
const router = express.Router();

function extractAxiosErrorInfo(err) {
  const info = {
    message: err.message,
    code: err.code,
    stack: err.stack,
    config: err.config && { url: err.config.url, method: err.config.method, data: err.config.data },
    response: undefined,
  };
  if (err.response) {
    info.response = {
      status: err.response.status,
      statusText: err.response.statusText,
      headers: err.response.headers,
      data: typeof err.response.data === 'string' ? err.response.data.slice(0, 2000) : JSON.stringify(err.response.data || {}).slice(0, 2000)
    };
  }
  return info;
}

router.delete('/history/:sessionId', async (req, res) => {
  const db = req.app.get('db');
  const { sessionId } = req.params;
  console.log('[Interview][delete] Attempting to delete session:', sessionId);
  
  if (!db) {
    console.error('[Interview][delete] Firestore not initialized');
    return res.status(500).json({ error: 'Firestore not initialized.' });
  }
  if (!sessionId) {
    console.error('[Interview][delete] sessionId is required');
    return res.status(400).json({ error: 'sessionId is required.' });
  }
  
  try {
    const sessionRef = db.collection('interview_sessions').doc(sessionId);
    
    // Check if session exists
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists) {
      console.log('[Interview][delete] Session not found:', sessionId);
      return res.status(404).json({ error: 'Session not found.' });
    }
    
    // Delete all questions in the subcollection
    const questionsSnap = await sessionRef.collection('questions').get();
    console.log('[Interview][delete] Deleting', questionsSnap.size, 'questions');
    
    const batch = db.batch();
    questionsSnap.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    
    // Delete the session document
    await sessionRef.delete();
    console.log('[Interview][delete] Session deleted successfully:', sessionId);
    
    res.json({ success: true, message: 'Session deleted successfully' });
  } catch (err) {
    console.error('[Interview][delete] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/history', async (req, res) => {
  const db = req.app.get('db');
  const userId = req.query.userId;
  if (!db) return res.status(500).json({ error: 'Firestore not initialized.' });
  if (!userId) return res.status(400).json({ error: 'userId is required.' });
  try {
    const sessionsSnap = await db.collection('interview_sessions').where('userId', '==', userId).get();
    const sessions = [];
    for (const doc of sessionsSnap.docs) {
      const sessionData = doc.data();
      const questionsSnap = await db.collection('interview_sessions').doc(doc.id).collection('questions').get();
      const questions = questionsSnap.docs.map(qd => qd.data());
      
      // Calculate average score
      const scores = questions.map(q => q.score).filter(s => s !== undefined && s !== null);
      const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined;
      
      sessions.push({ 
        sessionId: doc.id,
        position: sessionData.position,
        difficulty: sessionData.difficulty,
        startedAt: sessionData.startedAt,
        questionCount: questions.length,
        averageScore: averageScore,
        questions 
      });
    }
    // Return sessions array directly, not wrapped in object
    res.json(sessions);
  } catch (err) {
    console.error('[Interview][history] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/evaluate', async (req, res) => {
  const { category, job_position, difficulty, messages, userId, sessionId } = req.body;
  if (!job_position || !difficulty || !messages || !sessionId) {
    return res.status(400).json({ error: 'job_position, difficulty, messages, and sessionId are required.' });
  }
  try {
    const flaskRes = await axios.post(`${MOCK_INTERVIEW_FLASK_URL.replace(/\/$/, '')}/evaluate`, {
      category,
      job_position,
      difficulty,
      messages,
      userId,
      sessionId
    }, {
      timeout: 120000 // 120 second timeout
    });

    if (req.app.get('db')) {
      const db = req.app.get('db');
      const sessionRef = db.collection('interview_sessions').doc(sessionId);
      const lastAI = messages.filter(m => m.role === 'assistant').slice(-1)[0];
      const lastUser = messages.filter(m => m.role === 'user').slice(-1)[0];
      const feedback = flaskRes.data;
      const questionObj = {
        question: lastAI ? lastAI.content : '',
        answer: lastUser ? lastUser.content : '',
        score: feedback.score,
        positive_feedback: feedback.positive_feedback,
        improvement: feedback.improvement,
        next_question: feedback.next_question,
        timestamp: new Date()
      };
      await sessionRef.collection('questions').add(questionObj);
      
      // Calculate and update average score in the main session document
      const questionsSnap = await sessionRef.collection('questions').get();
      const scores = questionsSnap.docs
        .map(qd => qd.data().score)
        .filter(s => s !== undefined && s !== null);
      
      if (scores.length > 0) {
        const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        await sessionRef.update({
          score: averageScore,
          averageScore: averageScore,
          questionCount: questionsSnap.size,
          lastUpdated: new Date()
        });
        console.log(`[Interview][evaluate] Updated session ${sessionId} with average score: ${averageScore.toFixed(2)}`);
      }
    }

    res.json(flaskRes.data);
  } catch (err) {
    const info = extractAxiosErrorInfo(err);
    console.error('[Interview][evaluate] Error calling Flask evaluate:', info);
    const msg = (err.response && (err.response.data && (err.response.data.error || err.response.data))) || err.message || `Flask service error (status: ${err.response?.status ?? 'no-response'})`;
    res.status(500).json({ error: typeof msg === 'string' ? msg : JSON.stringify(msg) });
  }
});

router.post('/start', async (req, res) => {
  const { category, job_position, difficulty, userId } = req.body;
  if (!job_position || !difficulty) {
    return res.status(400).json({ error: 'job_position and difficulty are required.' });
  }
  try {
    const sessionId = crypto.randomBytes(12).toString('hex');

    const flaskRes = await axios.post(`${MOCK_INTERVIEW_FLASK_URL.replace(/\/$/, '')}/start`, {
      category,
      job_position,
      difficulty,
      sessionId,
      userId,
      messages: []
    }, {
      timeout: 120000 // 120 second timeout for cold starts
    });

    if (req.app.get('db')) {
      const db = req.app.get('db');
      await db.collection('interview_sessions').doc(sessionId).set({
        userId: userId || null,
        position: job_position,
        difficulty,
        startedAt: new Date(),
      }, { merge: true });
    }

    if (flaskRes.data && flaskRes.data.ai_message) {
      res.json({ ai_message: flaskRes.data.ai_message, sessionId });
    } else {
      console.error('[Interview][start] Empty ai_message from Flask:', flaskRes.data);
      res.status(502).json({ error: 'No AI message received from Flask service.' });
    }
  } catch (err) {
    const info = extractAxiosErrorInfo(err);
    console.error('[Interview][start] Error calling Flask interview start:', info);
    const statusCode = err.code === 'ECONNREFUSED' ? 503 : (err.response?.status || 500);
    let msg = 'Flask service error.';
    
    // Check for Gemini API quota error
    if (err.response?.data?.error && err.response.data.error.includes('RESOURCE_EXHAUSTED')) {
      msg = 'AI service quota exhausted. Please contact the administrator to update the API key.';
    } else if (err.response?.data?.error && err.response.data.error.includes('429')) {
      msg = 'AI service quota limit reached. Please try again later.';
    } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      msg = 'Interview service is starting up. Please try again in 30 seconds.';
    } else if (err.response && err.response.data) {
      msg = err.response.data.error || JSON.stringify(err.response.data);
    } else if (err.message) {
      msg = err.message;
    }
    res.status(statusCode).json({ error: typeof msg === 'string' ? msg : JSON.stringify(msg) });
  }
});

module.exports = router;
