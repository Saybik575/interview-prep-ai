import React, { useState } from "react";
import { Card, Form, Button, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";

const MockInterviewChat = ({ position, difficulty, messages, onSend, loading, onEndInterview }) => {
  const [input, setInput] = useState("");

  const handleSend = (e) => {
    e.preventDefault();
    if (input.trim()) {
      onSend(input);
      setInput("");
    }
  };

  return (
    <Card className="mb-4 shadow">
      <Card.Body className="d-flex flex-column align-items-center justify-content-center" style={{ minHeight: "500px" }}>
        <div className="w-100 mb-3" style={{ maxWidth: 600, textAlign: 'left' }}>
          <Button as={Link} to="/dashboard" variant="outline-primary" className="mb-2">
            Back to Dashboard
          </Button>
        </div>
        <h2 className="fs-2 fw-bold mb-3">Mock Interview In Progress</h2>
        <p className="mb-1">
          Position: <span className="fw-semibold">{position}</span>
        </p>
        <p className="mb-4">
          Difficulty: <span className="fw-semibold">{difficulty}</span>
        </p>
        <div className="w-100 mb-4" style={{ maxWidth: 600, minHeight: 200, background: '#f8f9fa', borderRadius: 8, padding: 16, overflowY: 'auto' }}>
          {messages && messages.length > 0 ? (
            <div className="chat-messages">
              {messages.map((msg, idx) => (
                <div key={idx} className={`mb-3 text-${msg.role === 'assistant' ? 'primary' : 'dark'}`}
                  style={{ textAlign: msg.role === 'assistant' ? 'left' : 'right' }}>
                  <span style={{ fontWeight: msg.role === 'assistant' ? 600 : 400 }}>
                    {msg.role === 'assistant' ? 'AI: ' : 'You: '}
                  </span>
                  {msg.content}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-secondary">No messages yet.</div>
          )}
        </div>
        <Form className="w-100" style={{ maxWidth: 600 }} onSubmit={handleSend} autoComplete="off">
          <Form.Group className="d-flex align-items-center mb-0">
            <Form.Control
              type="text"
              placeholder="Type your answer..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              autoFocus
            />
            <Button type="submit" variant="primary" className="ms-2" disabled={loading || !input.trim()}>
              {loading ? <Spinner animation="border" size="sm" /> : "Send"}
            </Button>
          </Form.Group>
        </Form>
        <Button variant="outline-danger" className="mt-4" onClick={onEndInterview}>
          End Interview
        </Button>
      </Card.Body>
    </Card>
  );
};

export default MockInterviewChat;
