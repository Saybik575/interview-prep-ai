const express = require('express');
const axios = require('axios');
const router = express.Router();

// DELETE /api/interview/history/:sessionId
router.delete('/history/:sessionId', async (req, res) => {
  const db = req.app.get('db');
  const { sessionId } = req.params;
  if (!db) return res.status(500).json({ error: 'Firestore not initialized.' });
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required.' });
  try {
    // Delete all questions subcollection docs
    const questionsSnap = await db.collection('interview_sessions').doc(sessionId).collection('questions').get();
    const batch = db.batch();
    questionsSnap.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    // Delete the session doc
    await db.collection('interview_sessions').doc(sessionId).delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// GET /api/interview/history?userId=...
router.get('/history', async (req, res) => {
  const db = req.app.get('db');
  const userId = req.query.userId;
  if (!db) return res.status(500).json({ error: 'Firestore not initialized.' });
  if (!userId) return res.status(400).json({ error: 'userId is required.' });
  try {
    // Get all sessions for this user
    const sessionsSnap = await db.collection('interview_sessions').where('userId', '==', userId).get();
    const sessions = [];
    for (const doc of sessionsSnap.docs) {
      const sessionData = doc.data();
      // Get all questions for this session
      const questionsSnap = await db.collection('interview_sessions').doc(doc.id).collection('questions').get();
      const questions = questionsSnap.docs.map(qd => qd.data());
      sessions.push({
        id: doc.id,
        ...sessionData,
        questions
      });
    }
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// POST /api/interview/evaluate
router.post('/evaluate', async (req, res) => {
  const { job_position, difficulty, messages, userId, sessionId } = req.body;
  if (!job_position || !difficulty || !messages || !sessionId) {
    return res.status(400).json({ error: 'job_position, difficulty, messages, and sessionId are required.' });
  }
  try {
    const flaskRes = await axios.post('http://localhost:5001/evaluate', {
      job_position,
      difficulty,
      messages
    });
    // Save to Firestore if available
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
    }
    res.json(flaskRes.data);
  } catch (err) {
    const msg = err.response?.data?.error || err.message || 'Flask service error.';
    res.status(500).json({ error: msg });
  }
});

// POST /api/interview/start
router.post('/start', async (req, res) => {
  const { job_position, difficulty, userId } = req.body;
  if (!job_position || !difficulty) {
    return res.status(400).json({ error: 'job_position and difficulty are required.' });
  }
  try {
    // Generate a unique sessionId (Firestore auto-ID style)
    const sessionId = require('crypto').randomBytes(12).toString('hex');
    const flaskRes = await axios.post('http://localhost:5001/interview', {
      job_position,
      difficulty,
      messages: [] // Start with empty conversation history
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
      res.status(502).json({ error: 'No AI message received from Flask service.' });
    }
  } catch (err) {
    const msg = err.response?.data?.error || err.message || 'Flask service error.';
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
