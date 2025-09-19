import React, { useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import {
  Container,
  Card,
  Form,
  Button,
} from "react-bootstrap";
import MockInterviewChat from "./MockInterviewChat";
import { auth } from "../firebase";




const MockInterviewPage = () => {
  const [position, setPosition] = useState("");
  const [difficulty, setDifficulty] = useState("Intermediate (Mid Level)");
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState("");

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
        userId
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

  // Handle ending the interview (return to setup view)
  const handleEndInterview = () => {
    setInterviewStarted(false);
    setMessages([]);
    setError("");
  };

  const handleStartInterview = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await axios.post("/api/interview/start", {
        job_position: position,
        difficulty
      });
      if (res.data && res.data.ai_message) {
        setMessages([{ role: "assistant", content: res.data.ai_message.content }]);
        setInterviewStarted(true);
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
              ▶️ Start New Interview
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
                      <li>5 tailored questions based on your target position</li>
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
    </Container>
  );
};

export default MockInterviewPage;
