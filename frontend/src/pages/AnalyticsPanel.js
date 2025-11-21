import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Row, Col, Card, Spinner, Alert, Tabs, Tab, Button } from 'react-bootstrap';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

const AnalyticsPanel = ({ userId }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [interviewData, setInterviewData] = useState([]);
  const [postureData, setPostureData] = useState([]);
  const [dressingData, setDressingData] = useState([]);
  const [resumeData, setResumeData] = useState([]);

  // Robust score extraction function
  const extractScore = (data, type = 'general') => {
    // Priority 1: Check for "averageScore" (This fixes the Posture 0% bug)
    if (data.averageScore !== undefined) return parseFloat(data.averageScore);

    // Priority 2: Check for Resume specific nested fields
    if (type === 'resume') {
       const nested = data.jsonResponse || data.analysis || {};
       const possibleScore = nested.score || nested.overallScore || data.score;
       
       // Handle "85/100" strings
       if (typeof possibleScore === 'string') {
         return parseFloat(possibleScore.split('/')[0]);
       }
       if (typeof possibleScore === 'number') return possibleScore;
    }

    // Priority 3: General fallbacks
    const score = data.score || 
                 data.posture_score || 
                 data.postureScore || 
                 data.rating || 
                 data.overallScore ||
                 0; // Default to 0 if nothing found

    return parseFloat(score);
  };

  // Normalize timestamp
  const normalizeTimestamp = (data) => {
    const timestampField = data.timestamp || data.startedAt || data.createdAt || data.serverTimestamp;
    
    if (!timestampField) return null;
    
    try {
      if (timestampField.toDate && typeof timestampField.toDate === 'function') {
        return timestampField.toDate();
      } else if (timestampField._seconds || timestampField.seconds) {
        const seconds = timestampField._seconds || timestampField.seconds;
        return new Date(seconds * 1000);
      } else {
        return new Date(timestampField);
      }
    } catch (e) {
      console.error('Error parsing timestamp:', e);
      return null;
    }
  };

  useEffect(() => {
    const fetchAllData = async () => {
      if (!userId) {
        setError('User ID is required');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch from all 4 collections in parallel
        const [interviewResults, postureResults, dressingResults, resumeResults] = await Promise.all([
          getDocs(query(collection(db, 'interview_sessions'), where('userId', '==', userId))),
          getDocs(query(collection(db, 'posture_sessions'), where('userId', '==', userId))),
          getDocs(query(collection(db, 'dressing_sessions'), where('userId', '==', userId))),
          getDocs(query(collection(db, 'resume_analysis'), where('userId', '==', userId)))
        ]);

        // Process interview sessions
        const interviews = [];
        interviewResults.forEach((doc) => {
          const data = doc.data();
          const timestamp = normalizeTimestamp(data);
          if (timestamp && !isNaN(timestamp.getTime())) {
            interviews.push({
              id: doc.id,
              timestamp,
              score: extractScore(data),
              position: data.position || 'N/A',
              difficulty: data.difficulty || 'N/A',
              questionCount: data.questionCount || 0
            });
          }
        });
        setInterviewData(interviews.sort((a, b) => a.timestamp - b.timestamp));

        // Process posture sessions (FIXED)
        const postureSessions = [];
        postureResults.forEach((doc) => {
          const data = doc.data();
          const timestamp = normalizeTimestamp(data);
          if (timestamp && !isNaN(timestamp.getTime())) {
            postureSessions.push({
              id: doc.id,
              timestamp,
              score: extractScore(data, 'posture'), // Uses new logic with averageScore priority
              feedback: data.feedback || 'No feedback'
            });
          }
        });
        setPostureData(postureSessions.sort((a, b) => a.timestamp - b.timestamp));

        // Process dressing sessions
        const dressingSessions = [];
        dressingResults.forEach((doc) => {
          const data = doc.data();
          const timestamp = normalizeTimestamp(data);
          if (timestamp && !isNaN(timestamp.getTime())) {
            dressingSessions.push({
              id: doc.id,
              timestamp,
              score: extractScore(data),
              feedback: data.feedback || ''
            });
          }
        });
        setDressingData(dressingSessions.sort((a, b) => a.timestamp - b.timestamp));

        // Process resume analysis (FIXED)
        const resumeSessions = [];
        resumeResults.forEach((doc) => {
          const data = doc.data();
          const timestamp = normalizeTimestamp(data);
          if (timestamp && !isNaN(timestamp.getTime())) {
            resumeSessions.push({
              id: doc.id,
              timestamp,
              score: extractScore(data, 'resume'),
              // Try multiple places for feedback text
              feedback: data.feedback || data.summary || (data.jsonResponse ? data.jsonResponse.summary : 'Analysis Complete')
            });
          }
        });
        setResumeData(resumeSessions.sort((a, b) => a.timestamp - b.timestamp));

        setLoading(false);
      } catch (err) {
        console.error('Error fetching analytics data:', err);
        setError(`Failed to load analytics data: ${err.message}`);
        setLoading(false);
      }
    };

    fetchAllData();
  }, [userId]);

  // Calculate overview stats
  const calculateStats = () => {
    const totalInterviews = interviewData.length;
    const avgInterview = interviewData.length > 0
      ? (interviewData.reduce((sum, item) => sum + item.score, 0) / interviewData.length).toFixed(1)
      : 0;
    
    const avgPosture = postureData.length > 0
      ? (postureData.reduce((sum, item) => sum + item.score, 0) / postureData.length).toFixed(1)
      : 0;
    
    const avgResume = resumeData.length > 0
      ? (resumeData.reduce((sum, item) => sum + item.score, 0) / resumeData.length).toFixed(1)
      : 0;
    
    const avgDressing = dressingData.length > 0
      ? (dressingData.reduce((sum, item) => sum + item.score, 0) / dressingData.length).toFixed(1)
      : 0;

    return { totalInterviews, avgInterview, avgPosture, avgResume, avgDressing };
  };

  // Format date for charts
  const formatDate = (timestamp) => {
    const month = String(timestamp.getMonth() + 1).padStart(2, '0');
    const day = String(timestamp.getDate()).padStart(2, '0');
    return `${month}/${day}`;
  };

  if (loading) {
    return (
      <Container className="py-5 text-center">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
        <p className="mt-3 text-muted">Loading analytics data...</p>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="py-5">
        <Alert variant="danger">
          <Alert.Heading>Error</Alert.Heading>
          <p>{error}</p>
        </Alert>
      </Container>
    );
  }

  const stats = calculateStats();

  return (
    <Container className="py-4">
      <h2 className="mb-4 fw-bold">Performance Analytics</h2>

      <Tabs defaultActiveKey="overview" id="analytics-tabs" className="mb-4">
        {/* Tab 1: Overview */}
        <Tab eventKey="overview" title="Overview">
          <Row className="g-4 mt-2">
            <Col md={4}>
              <Card className="shadow-sm h-100">
                <Card.Body className="text-center p-4">
                  <Card.Title className="text-muted mb-3">Total Interviews</Card.Title>
                  <h3 className="fw-bold text-primary mb-0">{stats.totalInterviews}</h3>
                </Card.Body>
              </Card>
            </Col>
            <Col md={4}>
              <Card className="shadow-sm h-100">
                <Card.Body className="text-center p-4">
                  <Card.Title className="text-muted mb-3">Avg Interview Score</Card.Title>
                  <h3 className="fw-bold text-info mb-0">{stats.avgInterview}/10</h3>
                </Card.Body>
              </Card>
            </Col>
            <Col md={4}>
              <Card className="shadow-sm h-100">
                <Card.Body className="text-center p-4">
                  <Card.Title className="text-muted mb-3">Avg Posture Score</Card.Title>
                  <h3 className="fw-bold text-success mb-0">{stats.avgPosture}%</h3>
                </Card.Body>
              </Card>
            </Col>
            <Col md={4}>
              <Card className="shadow-sm h-100">
                <Card.Body className="text-center p-4">
                  <Card.Title className="text-muted mb-3">Avg Dressing Rating</Card.Title>
                  <h3 className="fw-bold text-warning mb-0">{stats.avgDressing}/100</h3>
                </Card.Body>
              </Card>
            </Col>
            {resumeData.length > 0 && (
              <Col md={4}>
                <Card className="shadow-sm h-100">
                  <Card.Body className="text-center p-4">
                    <Card.Title className="text-muted mb-3">Resume Analysis Score</Card.Title>
                    <h3 className="fw-bold text-danger mb-0">{stats.avgResume}/100</h3>
                  </Card.Body>
                </Card>
              </Col>
            )}
          </Row>
        </Tab>

        {/* Tab 2: Mock Interview */}
        <Tab eventKey="interview" title="Mock Interview">
          <Card className="shadow-sm mb-4 mt-2">
            <Card.Body>
              <Card.Title className="mb-4">Interview Scores Over Time</Card.Title>
              {interviewData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={interviewData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey={(item) => formatDate(item.timestamp)} 
                      label={{ value: 'Date', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis 
                      label={{ value: 'Score', angle: -90, position: 'insideLeft' }}
                      domain={[0, 10]}
                    />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="score" 
                      stroke="#0d6efd" 
                      strokeWidth={2}
                      name="Interview Score"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-muted py-5">
                  <p>No interview sessions yet</p>
                  <small>Start a mock interview to see your progress!</small>
                </div>
              )}
              {interviewData.length > 0 && (
                <div className="text-center mt-4">
                  <Button 
                    variant="primary" 
                    onClick={() => navigate('/mock-interview')}
                    size="lg"
                  >
                    View Full History & Feedback
                  </Button>
                </div>
              )}
            </Card.Body>
          </Card>
        </Tab>

        {/* Tab 3: Posture */}
        <Tab eventKey="posture" title="Posture">
          <Card className="shadow-sm mt-2">
            <Card.Body>
              <Card.Title className="mb-4">Posture Scores Over Time</Card.Title>
              {postureData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={postureData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey={(item) => formatDate(item.timestamp)} 
                      label={{ value: 'Date', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis 
                      label={{ value: 'Score (%)', angle: -90, position: 'insideLeft' }}
                      domain={[0, 100]}
                    />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="score" 
                      stroke="#198754" 
                      strokeWidth={2}
                      name="Posture Score"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-muted py-5">
                  <p>No posture analysis sessions yet</p>
                  <small>Use the posture analyzer to track your progress!</small>
                </div>
              )}
              {postureData.length > 0 && (
                <div className="text-center mt-4">
                  <Button 
                    variant="success" 
                    onClick={() => navigate('/posture-analyzer')}
                    size="lg"
                  >
                    View Posture Analyzer
                  </Button>
                </div>
              )}
            </Card.Body>
          </Card>
        </Tab>

        {/* Tab 4: Resume */}
        <Tab eventKey="resume" title="Resume">
          <Card className="shadow-sm mb-4 mt-2">
            <Card.Body>
              <Card.Title className="mb-4">Resume Analysis Scores Over Time</Card.Title>
              {resumeData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={resumeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey={(item) => formatDate(item.timestamp)} 
                      label={{ value: 'Date', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis 
                      label={{ value: 'Score', angle: -90, position: 'insideLeft' }}
                      domain={[0, 100]}
                    />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="score" 
                      stroke="#dc3545" 
                      strokeWidth={2}
                      name="Resume Score"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-muted py-5">
                  <p>No resume uploaded yet</p>
                  <small>Upload your resume to get AI-powered feedback!</small>
                </div>
              )}
              {resumeData.length > 0 && (
                <div className="text-center mt-4">
                  <Button 
                    variant="danger" 
                    onClick={() => navigate('/resume-analysis')}
                    size="lg"
                  >
                    View Full Analysis & History
                  </Button>
                </div>
              )}
            </Card.Body>
          </Card>
        </Tab>

        {/* Tab 5: Dressing */}
        <Tab eventKey="dressing" title="Dressing">
          <Card className="shadow-sm mt-2">
            <Card.Body>
              <Card.Title className="mb-4">Dressing Sense Scores</Card.Title>
              {dressingData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={dressingData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey={(item) => formatDate(item.timestamp)} 
                      label={{ value: 'Date', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis 
                      label={{ value: 'Score (%)', angle: -90, position: 'insideLeft' }}
                      domain={[0, 100]}
                    />
                    <Legend />
                    <Bar 
                      dataKey="score" 
                      fill="#ffc107" 
                      name="Dressing Score"
                      barSize={60}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-muted py-5">
                  <p>No dressing analysis yet</p>
                  <small>Upload a photo to get professional attire feedback!</small>
                </div>
              )}
              {dressingData.length > 0 && (
                <div className="text-center mt-4">
                  <Button 
                    variant="warning" 
                    onClick={() => navigate('/dressing-sense')}
                    size="lg"
                  >
                    View Dressing Sense Analysis
                  </Button>
                </div>
              )}
            </Card.Body>
          </Card>
        </Tab>
      </Tabs>
    </Container>
  );
};

export default AnalyticsPanel;
