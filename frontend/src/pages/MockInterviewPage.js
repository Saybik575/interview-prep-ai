import { Link } from "react-router-dom";
import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { Container, Card, Form, Button, Spinner, Collapse, Modal, Row, Col, Alert } from "react-bootstrap"; // Added Row, Col, Alert
import MockInterviewChat from "./MockInterviewChat";
import { auth } from "../firebase";

const MockInterviewPage = () => {
  const [position, setPosition] = useState("");
  const [difficulty, setDifficulty] = useState("Intermediate (Mid Level)");
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [deleteLoading, setDeleteLoading] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState("timestamp");
  const [sortDirection, setSortDirection] = useState("desc");
  const [showLatestOnly, setShowLatestOnly] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState(null);
  const [sessionId, setSessionId] = useState(null);

  // Handle sending a user message (answer) and get evaluation feedback
  const handleSendMessage = async (userInput) => {
    setLoading(true);
    setError("");
    const newMessages = [...messages, { role: "user", content: userInput }];
    setMessages(newMessages);
    try {
      // Get current user UID if logged in
      const user = auth.currentUser;
      const userId = user ? user.uid : null;
      // Call backend to get feedback, score, and next question
      const res = await axios.post("/api/interview/evaluate", {
        job_position: position,
        difficulty,
        messages: newMessages,
        userId,
        sessionId
      });
      if (res.data && res.data.next_question) {
        // Add feedback and score as a special assistant message
        const feedbackMsg = {
          role: "assistant",
          content: `\n\nScore: ${res.data.score}/10\n\nPositive Feedback: ${res.data.positive_feedback}\n\nImprovement: ${res.data.improvement}`
        };
        // Add next question as a new assistant message
        const nextQuestionMsg = {
          role: "assistant",
          content: res.data.next_question
        };
        setMessages([...newMessages, feedbackMsg, nextQuestionMsg]);
      } else {
        setError("No response from AI.");
      }
    } catch (err) {
      setError(err.response?.data?.error || "Failed to send message.");
    } finally {
      setLoading(false);
    }
  };

  // Handle ending the interview (show setup + history)
  const handleEndInterview = () => {
    setInterviewStarted(false);
    setMessages([]);
    setError("");
    setSessionId(null);
    fetchHistory();
  };

  // Fetch interview history for logged-in user
  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        setHistory([]);
        setHistoryLoading(false);
        return;
      }
      const res = await axios.get(`/api/interview/history?userId=${user.uid}`);
      setHistory(res.data.sessions || []);
    } catch (err) {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleToggle = (sessionId) => {
    setExpanded((prev) => ({ ...prev, [sessionId]: !prev[sessionId] }));
  };

  const handleDeleteSession = async (sessionId) => {
    setShowDeleteModal(true);
    setSessionToDelete(sessionId);
  };

  const confirmDeleteSession = async () => {
    if (!sessionToDelete) return;
    setDeleteLoading(sessionToDelete);
    try {
      await axios.delete(`/api/interview/history/${sessionToDelete}`);
      setHistory((prev) => prev.filter((s) => s.id !== sessionToDelete));
      setShowDeleteModal(false);
      setSessionToDelete(null);
    } catch (err) {
      alert("Failed to delete session.");
    } finally {
      setDeleteLoading(null);
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    if (!processedHistory.length) return;
    const rows = [
      ["Position", "Difficulty", "Score", "Question", "Answer", "Feedback", "Improvement", "Time"]
    ];
    processedHistory.forEach((session) => {
      session.questions.forEach((q, idx) => {
        rows.push([
          session.position,
          session.difficulty,
          q.score,
          q.question.replace(/\n/g, " "),
          q.answer.replace(/\n/g, " "),
          q.positive_feedback.replace(/\n/g, " "),
          q.improvement.replace(/\n/g, " "),
          q.timestamp && (q.timestamp._seconds ? new Date(q.timestamp._seconds * 1000).toLocaleString() : q.timestamp)
        ]);
      });
    });
    const csvContent = rows.map(r => r.map(f => '"' + String(f).replace(/"/g, '""') + '"').join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "interview_history.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter, sort, and latest logic
  const processedHistory = useMemo(() => {
    let filtered = history;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((session) => {
        const pos = session.position?.toLowerCase() || "";
        const diff = session.difficulty?.toLowerCase() || "";
        const questions = session.questions.map(q => (q.question + q.answer + q.positive_feedback + q.improvement).toLowerCase()).join(" ");
        const score = session.questions.map(q => String(q.score)).join(" ");
        const time = session.questions.map(q => q.timestamp && (q.timestamp._seconds ? new Date(q.timestamp._seconds * 1000).toLocaleString() : q.timestamp)).join(" ");
        return pos.includes(term) || diff.includes(term) || questions.includes(term) || score.includes(term) || time.includes(term);
      });
    }
    filtered = [...filtered].sort((a, b) => {
      let aVal = a.questions[0]?.timestamp?._seconds || 0;
      let bVal = b.questions[0]?.timestamp?._seconds || 0;
      if (sortKey === "score") {
        aVal = a.questions[0]?.score || 0;
        bVal = b.questions[0]?.score || 0;
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
  }, [history, searchTerm, sortKey, sortDirection, showLatestOnly]);

  const handleStartInterview = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const user = auth.currentUser;
      const userId = user ? user.uid : null;
      const res = await axios.post("/api/interview/start", {
        job_position: position,
        difficulty,
        userId
      });
      if (res.data && res.data.ai_message && res.data.sessionId) {
        setMessages([{ role: "assistant", content: res.data.ai_message.content }]);
        setInterviewStarted(true);
        setSessionId(res.data.sessionId);
      } else {
        setError("No AI question received. Please try again.");
      }
    } catch (err) {
      setError(err.response?.data?.error || "Failed to start interview.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="py-5">

      <Button as={Link} to="/dashboard" variant="outline-primary" className="mb-4">
        Back to Dashboard
      </Button>

      {error && <div className="alert alert-danger">{error}</div>}

      {!interviewStarted ? (
        <Card className="mb-4 shadow">
          <Card.Body>
            <Card.Title as="h2" className="mb-3">
              <span style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 16 }}>
                <svg width="32" height="32" viewBox="0 0 32 32" fill="orange" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle' }}>
                  <circle cx="16" cy="16" r="16" fill="#FFA500"/>
                  <polygon points="13,10 23,16 13,22" fill="white"/>
                </svg>
              </span>
              <span style={{ fontSize: '2rem', verticalAlign: 'middle' }}>Start New Interview</span>
            </Card.Title>
            <p className="text-secondary mb-4">
              Configure your mock interview session
            </p>
            <Form onSubmit={handleStartInterview}>
              <Form.Group className="mb-3" controlId="position">
                <Form.Label>Position</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="e.g., Software Engineer, Product Manager..."
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  required
                />
              </Form.Group>

              <Form.Group className="mb-4" controlId="difficulty">
                <Form.Label>Difficulty Level</Form.Label>
                <Form.Select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                >
                  <option>Beginner (Entry Level)</option>
                  <option>Intermediate (Mid Level)</option>
                  <option>Expert (Senior Level)</option>
                </Form.Select>
              </Form.Group>

                  <div className="w-100 mb-4" style={{ background: '#f1f6fd', padding: '1.5rem 1.5rem 1.5rem 1.5rem' }}>
                    <h3 className="fw-semibold mb-2" style={{ color: '#174ea6' }}>
                      What to Expect:
                    </h3>
                    <ul className="mb-0" style={{ color: '#174ea6', fontSize: '1rem', listStyle: 'disc inside' }}>
                      <li>Tailored questions based on your target position</li>
                      <li>Real-time analysis of your responses</li>
                      <li>Compare your answers with ideal responses</li>
                      <li>Comprehensive feedback and scoring</li>
                      <li>Specific recommendations for improvement</li>
                    </ul>
                  </div>

              <Button
                type="submit"
                variant="warning"
                className="w-100 fs-5 fw-semibold text-white"
                style={{ backgroundColor: "#f59e42", borderColor: "#f59e42" }}
                disabled={loading}
              >
                {loading ? "Starting..." : "Start Interview"}
              </Button>
            </Form>
          </Card.Body>
        </Card>
      ) : (
        <MockInterviewChat
          position={position}
          difficulty={difficulty}
          messages={messages}
          onSend={handleSendMessage}
          loading={loading}
          onEndInterview={handleEndInterview}
        />
      )}

      {/* NEW: Interview Strategy Tips Card */}
      <Card className='mb-4 shadow'>
        <Card.Body>
          <Card.Title as='h3' className='mb-3'>🗣️ Interview Strategy Tips</Card.Title>
          <Row>
            <Col md={4} className='mb-3'>
              <Alert variant='success' className='mb-0'>
                <strong>Use the STAR Method:</strong> Structure behavioral answers using Situation, Task, Action, and Result.
              </Alert>
            </Col>
            <Col md={4} className='mb-3'>
              <Alert variant='info' className='mb-0'>
                <strong>Quantify Achievements:</strong> Use numbers and data to demonstrate the impact of your work (e.g., "Increased efficiency by 20%").
              </Alert>
            </Col>
            <Col md={4} className='mb-3'>
              <Alert variant='warning' className='mb-0'>
                <strong>Prepare Questions:</strong> Always have 2-3 thoughtful questions ready for the interviewer about the role or company.
              </Alert>
            </Col>
          </Row>
        </Card.Body>
      </Card>
      {/* END NEW TIPS */}

      {/* Interview History Table - only show when not in interview */}
      {!interviewStarted && (
        <Card className="mb-4">
          <Card.Body>
            <Card.Title as="h3">Interview History</Card.Title>
            <div className="d-flex flex-wrap align-items-center mb-3 gap-2">
              <Form.Control
                type="text"
                placeholder="Search by position, score, or date..."
                style={{ maxWidth: 250 }}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              <Form.Select
                value={sortKey}
                onChange={e => setSortKey(e.target.value)}
                style={{ maxWidth: 120 }}
              >
                <option value="timestamp">Sort by Date</option>
                <option value="score">Sort by Score</option>
              </Form.Select>
              <Form.Select
                value={sortDirection}
                onChange={e => setSortDirection(e.target.value)}
                style={{ maxWidth: 120 }}
              >
                <option value="desc">Descend</option>
                <option value="asc">Ascend</option>
              </Form.Select>
              <Form.Check
                type="checkbox"
                label="Show Latest Only"
                checked={showLatestOnly}
                onChange={e => setShowLatestOnly(e.target.checked)}
                className="ms-2"
              />
              <Button variant="outline-secondary" size="sm" onClick={exportToCSV}>
                Export
              </Button>
            </div>
            {historyLoading ? (
              <Spinner animation="border" />
            ) : (
              <div className="table-responsive">
                <table className="table table-bordered align-middle">
                  <thead className="table-light">
                    <tr>
                      <th>Date</th>
                      <th>Position</th>
                      <th>Difficulty</th>
                      <th>Score</th>
                      <th>Details</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processedHistory.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center text-secondary">No interview sessions found.</td>
                      </tr>
                    ) : (
                      processedHistory.map((session) => {
                        const firstQ = session.questions[0] || {};
                        return (
                          <React.Fragment key={session.id}>
                            <tr>
                              <td>{firstQ.timestamp && (firstQ.timestamp._seconds ? new Date(firstQ.timestamp._seconds * 1000).toLocaleString() : firstQ.timestamp)}</td>
                              <td>{session.position}</td>
                              <td>{session.difficulty}</td>
                              <td>{firstQ.score !== undefined ? firstQ.score + "/10" : "-"}</td>
                              <td>
                                <Button
                                  variant="link"
                                  size="sm"
                                  onClick={() => handleToggle(session.id)}
                                  aria-controls={`collapse-${session.id}`}
                                  aria-expanded={expanded[session.id] || false}
                                >
                                  {expanded[session.id] ? "Hide Details" : "Show Details"}
                                </Button>
                              </td>
                              <td>
                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={() => handleDeleteSession(session.id)}
                                  disabled={deleteLoading === session.id}
                                >
                                  {deleteLoading === session.id ? <Spinner size="sm" /> : "Delete"}
                                </Button>
                              </td>
                            </tr>
                            <tr>
                              <td colSpan={5} style={{ padding: 0, border: 0 }}>
                                <Collapse in={expanded[session.id] || false}>
                                  <div id={`collapse-${session.id}`} className="p-3 bg-light">
                                    <ul className="list-group list-group-flush">
                                      {session.questions.map((q, idx) => (
                                        <li className="list-group-item" key={idx}>
                                          <strong>Q{idx + 1}:</strong> {q.question}
                                          <br />
                                          <strong>Your Answer:</strong> {q.answer}
                                          <br />
                                          <strong>Score:</strong> {q.score}/10
                                          <br />
                                          <strong>Feedback:</strong> {q.positive_feedback}
                                          <br />
                                          <strong>Improvement:</strong> {q.improvement}
                                          <br />
                                          <strong>Time:</strong> {q.timestamp && (q.timestamp._seconds ? new Date(q.timestamp._seconds * 1000).toLocaleString() : q.timestamp)}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </Collapse>
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {/* Delete confirmation modal */}
            <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
              <Modal.Header closeButton>
                <Modal.Title>Delete Interview Session</Modal.Title>
              </Modal.Header>
              <Modal.Body>Are you sure you want to delete this interview session? This cannot be undone.</Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={confirmDeleteSession} disabled={deleteLoading}>
                  {deleteLoading ? <Spinner size="sm" /> : "Delete"}
                </Button>
              </Modal.Footer>
            </Modal>
          </Card.Body>
        </Card>
      )}
    </Container>
  );
};

export default MockInterviewPage;