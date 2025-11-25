// /mnt/data/MockInterviewPage.js
import React, { useState, useEffect, useMemo, useCallback } from "react";
import api from "../api/config";
import { Container, Card, Form, Button, Row, Col, Alert, Table, Spinner, Modal } from "react-bootstrap";
import MockInterviewChat from "./MockInterviewChat";
import { auth, db } from "../firebase";
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';

// Helper function to safely format dates
const formatDate = (dateValue) => {
  if (!dateValue) return "N/A";
  try {
    if (dateValue.toDate && typeof dateValue.toDate === 'function') {
        return dateValue.toDate().toLocaleString();
    }
    if (dateValue._seconds) {
      return new Date(dateValue._seconds * 1000).toLocaleString();
    }
    const parsed = new Date(dateValue);
    return isNaN(parsed.getTime()) ? "N/A" : parsed.toLocaleString();
  } catch (err) {
    console.error("Error formatting date:", err);
    return "N/A";
  }
};

const CATEGORIES = {
  "Software Engineering": [
    "Software Engineer",
    "Frontend Developer",
    "Backend Developer",
    "Full-Stack Developer",
    "Mobile Developer",
    "Embedded Systems Engineer",
    "Game Developer",
    "Blockchain Developer",
    "Engineering Manager",
    "SDET (Software Development Engineer in Test)",
    "Release Engineer",
    "Graphics Programmer",
    "API Developer"
  ],
  "Data & AI": [
    "Data Engineer",
    "Data Scientist",
    "Machine Learning Engineer",
    "MLOps Engineer",
    "Business Intelligence Engineer",
    "Data Analyst",
    "Quantitative Analyst",
    "AI/Research Scientist",
    "Deep Learning Engineer",
    "NLP Engineer",
    "Computer Vision Engineer",
    "Data Architect"
  ],
  "Cloud & DevOps": [
    "DevOps Engineer",
    "SRE",
    "Cloud Engineer",
    "MLOps Engineer",
    "Cloud Architect",
    "Solutions Architect",
    "System Administrator",
    "Network Engineer",
    "IT Support Specialist"
  ],
  "Security": [
    "Cybersecurity Engineer",
    "SOC Analyst",
    "Privacy Engineer",
    "Information Security Analyst",
    "Penetration Tester",
    "Security Architect",
    "Forensics Analyst"
  ],
  "Product & Design": [
    "Product Manager",
    "Product Designer",
    "UX Researcher",
    "UX/UI Designer",
    "Design Lead",
    "Technical Product Manager",
    "Content Strategist",
    "Service Designer"
  ],
  "Business & Marketing": [
    "Project Manager",
    "Program Manager",
    "Business Analyst",
    "Digital Marketer",
    "Growth Analyst",
    "Sales Engineer",
    "Customer Success Manager",
    "Management Consultant",
    "Financial Analyst",
    "Operations Manager",
    "SEO Specialist",
    "Content Marketing Manager"
  ],
  "Creative": [
    "Content Writer",
    "Copywriter",
    "Graphic Designer",
    "Video Editor",
    "Technical Writer",
    "Motion Graphics Designer",
    "Illustrator"
  ],
  "Healthcare": [
    "Healthcare Data Analyst",
    "Clinical Operations Coordinator",
    "Health Informatics Specialist",
    "Medical Science Liaison",
    "Biostatistician"
  ]
};
const DIFFICULTIES = ["Beginner (Entry Level)", "Intermediate (Mid Level)", "Expert (Senior Level)"];

const getDefaultPosition = (category) => {
    const roles = CATEGORIES[category];
    return (roles && roles.length > 0) ? roles[0] : "";
};

const MockInterviewPage = () => {
  const [category, setCategory] = useState("Software Engineering");
  const [position, setPosition] = useState(getDefaultPosition("Software Engineering")); 
  const [difficulty, setDifficulty] = useState(DIFFICULTIES[0]);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState("timestamp");
  const [sortDirection, setSortDirection] = useState("desc");
  const [showLatestOnly, setShowLatestOnly] = useState(false);
  // State to hold optimistic session data until fetch verifies it
  const [optimisticSession, setOptimisticSession] = useState(null); 

  useEffect(() => {
    setPosition(getDefaultPosition(category));
  }, [category]);

  // ----------------------------------------------------
  // HISTORY FETCHING (Direct Firestore) — now accepts optional uid
  // ----------------------------------------------------
  const fetchHistoryClient = useCallback(async (uidOptional) => {
    const uid = uidOptional || (auth.currentUser ? auth.currentUser.uid : null);
    if (!uid) { setHistory([]); return; }
    
    setIsHistoryLoading(true);
    try {
      const sessionsRef = collection(db, 'interview_sessions');
      const q = query(
        sessionsRef,
        where('userId', '==', uid),
        orderBy('timestamp', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      const fetchedData = [];
      
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        fetchedData.push({
            sessionId: docSnap.id,
            position: data.position,
            difficulty: data.difficulty,
            startedAt: data.startedAt,
            questionCount: data.questionCount || 0,
            averageScore: data.averageScore,
            timestamp: data.timestamp, 
        });
      });
      
      setHistory(fetchedData);
      setError('');
    } catch (err) {
      console.error("Failed to fetch interview history directly from Firestore:", err);
      setError('Failed to load history: ' + (err.message || err));
      setHistory([]);
    } finally {
      setIsHistoryLoading(false);
    }
  }, []);


  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (user) fetchHistoryClient(user.uid);
      else setHistory([]);
    });
    return () => unsubscribe();
  }, [fetchHistoryClient]);

  const handleDeleteClick = (item) => {
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      const response = await api.delete(`/api/interview/history/${itemToDelete.sessionId}`);
      setHistory(prev => prev.filter(s => s.sessionId !== itemToDelete.sessionId));
      alert(response.data.message || "Interview session deleted successfully.");
    } catch (err) {
      console.error("Failed to delete session:", err);
      const errorMsg = err.response?.status === 404 
        ? "Session not found. It may have already been deleted."
        : err.response?.data?.error || err.message || "Failed to delete session.";
      alert("Failed to delete session: " + errorMsg);
    } finally {
      setShowDeleteModal(false);
      setItemToDelete(null);
    }
  };

  const handleStartInterview = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setOptimisticSession(null);
    try {
      const user = auth.currentUser;
      const userId = user ? user.uid : null;
      const res = await api.post("/api/interview/start", {
        category,
        job_position: position,
        difficulty,
        userId
      });
      if (res.data && res.data.ai_message && res.data.sessionId) {
        setMessages([{ role: "assistant", content: res.data.ai_message.content }]);
        setSessionId(res.data.sessionId);
        setInterviewStarted(true);
      } else {
        setError("No AI question received. Please try again.");
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to start interview.");
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (userInput) => {
    setLoading(true);
    setError("");
    const newMessages = [...messages, { role: "user", content: userInput }];
    setMessages(newMessages);
    try {
      const user = auth.currentUser;
      const userId = user ? user.uid : null;
      const res = await api.post("/api/interview/evaluate", {
        category,
        job_position: position,
        difficulty,
        messages: newMessages,
        userId,
        sessionId
      });

      if (res.data && (res.data.score !== undefined || res.data.next_question)) {
        const feedbackParts = [];
        if (res.data.score !== undefined) feedbackParts.push(`Score: ${res.data.score}/10`);
        if (res.data.positive_feedback) feedbackParts.push(`Positive: ${res.data.positive_feedback}`);
        if (res.data.improvement) feedbackParts.push(`Improvement: ${res.data.improvement}`);

        const feedbackMsg = {
          role: "assistant",
          content: feedbackParts.join("\n\n")
        };
        const nextQuestionMsg = {
          role: "assistant",
          content: res.data.next_question || "Thank you — no follow-up question."
        };
        setMessages([...newMessages, feedbackMsg, nextQuestionMsg]);
        
        // optimistic session update
        const currentAvgScore = res.data.score;
        setOptimisticSession(prev => ({
            sessionId: sessionId || `local-${Date.now()}`,
            position: position,
            difficulty: difficulty,
            startedAt: new Date(),
            questionCount: (prev?.questionCount || 0) + 1,
            averageScore: currentAvgScore
        }));
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: "No valid feedback returned by AI." }]);
      }
    } catch (err) {
      const msg = err.response?.data?.raw_text_preview || err.response?.data?.error || err.message || "Evaluation failed";
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  };

  // --- FIXED: ensure fetchHistoryClient is called with uid, reconcile, THEN clear optimisticSession ---
  const handleEndInterview = async () => {
    // 1. Optimistically prepend the session data if available
    if (optimisticSession) {
        setHistory(prev => [optimisticSession, ...prev.filter(h => h.sessionId !== optimisticSession.sessionId)]);
    }
    
    // 2. Clear current session state that should be reset immediately
    setInterviewStarted(false);
    setMessages([]);
    setSessionId(null);
    setError("");
    
    // 3. Reconcile with server-side history (pass uid explicitly)
    const user = auth.currentUser;
    try {
      await fetchHistoryClient(user ? user.uid : null);
    } catch (err) {
      console.warn('fetchHistoryClient during endInterview failed', err);
    } finally {
      // 4. Keep optimisticSession until server data arrives; then clear to avoid duplication
      setOptimisticSession(null);
    }
  };

  // Memoized filtered and sorted history
  const processedHistory = useMemo(() => {
    let filtered = history;

    // If optimisticSession exists, ensure it is included for immediate display
    if (optimisticSession) {
        const exists = filtered.some(h => h.sessionId === optimisticSession.sessionId);
        if (!exists) {
            filtered = [optimisticSession, ...filtered];
        }
    }
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((item) => {
        const positionStr = (item.position || "").toLowerCase();
        const difficultyStr = (item.difficulty || "").toLowerCase();
        const dateVal = item.startedAt || item.timestamp;
        const dateStr = dateVal ? formatDate(dateVal).toLowerCase() : '';
        const scoreStr = String(item.averageScore ?? "");
        return positionStr.includes(term) || difficultyStr.includes(term) || dateStr.includes(term) || scoreStr.includes(term);
      });
    }

    filtered = [...filtered].sort((a, b) => {
      let aVal = a[sortKey];
      let bVal = b[sortKey];
      
      if (sortKey === "timestamp" || sortKey === "startedAt") {
        const aDate = a.startedAt || a.timestamp;
        const bDate = b.startedAt || b.timestamp;
        aVal = aDate ? (aDate.toDate ? aDate.toDate().getTime() : new Date(aDate).getTime()) : 0;
        bVal = bDate ? (bDate.toDate ? bDate.toDate().getTime() : new Date(bDate).getTime()) : 0;
      }
      if (sortKey === "averageScore" || sortKey === "questionCount") {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
      }
      
      if (sortDirection === "asc") {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });

    if (showLatestOnly && filtered.length) {
      return [filtered[0]];
    }
    return filtered;
  }, [history, searchTerm, sortKey, sortDirection, showLatestOnly, optimisticSession]);

  const handleExport = () => {
    if (!processedHistory.length) return;
    const headers = ["Date", "Position", "Difficulty", "Questions", "Avg Score"];
    const rows = processedHistory.map((h) => {
      const dateStr = formatDate(h.startedAt || h.timestamp);
      return [
        dateStr,
        h.position || "",
        h.difficulty || "",
        h.questionCount || 0,
        h.averageScore !== undefined ? (typeof h.averageScore === 'number' ? h.averageScore.toFixed(1) : h.averageScore) : "N/A",
      ];
    });
    let csv = headers.join(",") + "\n" + rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "interview_history.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Container className="py-5">
      <Button href="/dashboard" variant="outline-primary" className="mb-4">Back to Dashboard</Button>

      {error && <Alert variant="danger">{error}</Alert>}

      {!interviewStarted ? (
        <>
          <Card className="mb-4 shadow">
            <Card.Body>
              <h2>
                <span style={{ fontSize: '2rem', marginRight: '12px' }}>▶️</span>
                Start New Interview
              </h2>
              <Alert variant="info" className="mb-3">
                <strong>💡 Tip:</strong> Each interview session works best with 3-5 questions. You can start a new session anytime for more practice!
              </Alert>
              <Form onSubmit={handleStartInterview}>
                <Form.Group className="mb-3">
                  <Form.Label>Category</Form.Label>
                  <Form.Select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {Object.keys(CATEGORIES).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </Form.Select>
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Role</Form.Label>
                  <Form.Select value={position} onChange={(e) => setPosition(e.target.value)}>
                    {CATEGORIES[category].map(role => <option key={role} value={role}>{role}</option>)}
                  </Form.Select>
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Difficulty</Form.Label>
                  <Form.Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                    {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                  </Form.Select>
                </Form.Group>

                <Button type="submit" variant="warning" className="text-white" disabled={loading}>
                  {loading ? "Starting..." : "Start Interview"}
                </Button>
              </Form>
            </Card.Body>
          </Card>

          <Card className="mb-4 shadow">
            <Card.Body>
              <h3>Interview Strategy Tips</h3>
              <Row>
                <Col md={4}><Alert variant="success"><strong>STAR Method:</strong> Use Situation, Task, Action, Result.</Alert></Col>
                <Col md={4}><Alert variant="info"><strong>Quantify:</strong> Use numbers to strengthen answers (e.g., improved X by 20%).</Alert></Col>
                <Col md={4}><Alert variant="warning"><strong>Ask Questions:</strong> Have 2–3 thoughtful questions about the role.</Alert></Col>
              </Row>
            </Card.Body>
          </Card>

          <Card className="mb-4 shadow">
            <Card.Body>
              <h3>History</h3>
              <div className="d-flex flex-wrap gap-3 mb-3 align-items-center">
                <Form.Control
                  type="text"
                  placeholder="Search by position, difficulty, score..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ maxWidth: 280 }}
                />
                <Form.Select
                  value={sortKey}
                  onChange={e => setSortKey(e.target.value)}
                  style={{ maxWidth: 160 }}
                >
                  <option value="timestamp">Sort by Date</option>
                  <option value="position">Sort by Position</option>
                  <option value="averageScore">Sort by Score</option>
                  <option value="questionCount">Sort by Questions</option>
                </Form.Select>
                <Form.Select
                  value={sortDirection}
                  onChange={e => setSortDirection(e.target.value)}
                  style={{ maxWidth: 120 }}
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </Form.Select>
                <Form.Check
                  type="switch"
                  id="latest-only-toggle"
                  label="Show Latest Only"
                  checked={showLatestOnly}
                  onChange={e => setShowLatestOnly(e.target.checked)}
                />
                <Button variant="outline-secondary" onClick={handleExport}>Export</Button>
              </div>
              <Table striped bordered responsive className="mb-0">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Position</th>
                    <th>Difficulty</th>
                    <th>Questions</th>
                    <th>Avg Score</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isHistoryLoading ? (
                    <tr>
                      <td colSpan={6} className="text-center">
                        <Spinner animation="border" size="sm" className="me-2" /> Loading...
                      </td>
                    </tr>
                  ) : processedHistory.length ? (
                    processedHistory.map((session) => (
                      <tr key={session.sessionId}>
                        <td>{formatDate(session.startedAt || session.timestamp)}</td>
                        <td>{session.position}</td>
                        <td>{session.difficulty}</td>
                        <td>{session.questionCount || 0}</td>
                        <td>
                          {session.averageScore !== undefined 
                            ? `${(typeof session.averageScore === 'number' ? session.averageScore.toFixed(1) : session.averageScore)}/10` 
                            : 'N/A'}
                        </td>
                        <td>
                          <Button 
                            variant="outline-danger" 
                            size="sm"
                            onClick={() => handleDeleteClick(session)}
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="text-center text-muted">
                        No interview history yet. Start your first interview above!
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </>
      ) : (
        <MockInterviewChat
          category={category}
          position={position}
          difficulty={difficulty}
          messages={messages}
          onSend={handleSend}
          loading={loading}
          onEndInterview={handleEndInterview}
        />
      )}

      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Confirm Delete</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete this interview session?
          {itemToDelete && (
            <div className="mt-2">
              <strong>Position:</strong> {itemToDelete.position}<br />
              <strong>Date:</strong> {formatDate(itemToDelete.startedAt || itemToDelete.timestamp)}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirmDelete}>
            Delete
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default MockInterviewPage;
