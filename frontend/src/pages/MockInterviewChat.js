import React, { useState, useRef, useEffect } from "react";
import { Card, Form, Button, Spinner } from "react-bootstrap";

const MockInterviewChat = ({ category, position, difficulty, messages, onSend, loading, onEndInterview }) => {
  const [input, setInput] = useState("");
  const scrollRef = useRef();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <Card className="mb-4 shadow">
      <Card.Body className="d-flex flex-column">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h3 className="mb-0">Mock Interview In Progress</h3>
            <small className="text-muted">Role: <strong>{position}</strong> • Category: {category} • Difficulty: {difficulty}</small>
          </div>
          <div>
            <Button variant="outline-danger" size="sm" onClick={onEndInterview}>End Interview</Button>
          </div>
        </div>

        <div ref={scrollRef} style={{ minHeight: 320, maxHeight: 520, overflowY: "auto", padding: 12, background: "#f8f9fa", borderRadius: 6 }}>
          {messages && messages.length > 0 ? (
            messages.map((m, idx) => (
              <div key={idx} style={{ marginBottom: 12, textAlign: m.role === "assistant" ? "left" : "right" }}>
                <div style={{ fontSize: 12, color: m.role === "assistant" ? "#0d6efd" : "#333", fontWeight: 600 }}>
                  {m.role === "assistant" ? "AI" : "You"}
                </div>
                <div style={{ marginTop: 6, display: "inline-block", background: m.role === "assistant" ? "#fff" : "#e9f5ff", padding: "10px 12px", borderRadius: 8, maxWidth: "90%" }}>
                  <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{m.content}</pre>
                </div>
              </div>
            ))
          ) : (
            <div className="text-secondary">No messages yet.</div>
          )}
        </div>

        <Form onSubmit={handleSubmit} className="mt-3 d-flex gap-2">
          <Form.Control
            type="text"
            placeholder="Type your answer..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            autoComplete="off"
          />
          <Button type="submit" disabled={loading || !input.trim()}>
            {loading ? <Spinner animation="border" size="sm" /> : "Send"}
          </Button>
        </Form>
      </Card.Body>
    </Card>
  );
};

export default MockInterviewChat;
