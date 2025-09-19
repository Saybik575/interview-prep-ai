
const express = require('express');
const axios = require('axios');
const router = express.Router();

// POST /api/interview/evaluate
router.post('/evaluate', async (req, res) => {
  const { job_position, difficulty, messages, userId, sessionId } = req.body;
  if (!job_position || !difficulty || !messages) {
    return res.status(400).json({ error: 'job_position, difficulty, and messages are required.' });
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
      const sessionRef = db.collection('interview_sessions').doc(sessionId || userId || 'anonymous');
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
      await sessionRef.set({
        userId: userId || null,
        position: job_position,
        difficulty,
        startedAt: new Date(),
      }, { merge: true });
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
  const { job_position, difficulty } = req.body;
  if (!job_position || !difficulty) {
    return res.status(400).json({ error: 'job_position and difficulty are required.' });
  }
  try {
    const flaskRes = await axios.post('http://localhost:5001/interview', {
      job_position,
      difficulty,
      messages: [] // Start with empty conversation history
    });
    if (flaskRes.data && flaskRes.data.ai_message) {
      res.json({ ai_message: flaskRes.data.ai_message });
    } else {
      res.status(502).json({ error: 'No AI message received from Flask service.' });
    }
  } catch (err) {
    const msg = err.response?.data?.error || err.message || 'Flask service error.';
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
