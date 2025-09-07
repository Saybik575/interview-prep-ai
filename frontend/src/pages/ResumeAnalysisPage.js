import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Card,
  Form,
  Button,
  Table,
  Spinner,
  Modal,
} from "react-bootstrap";

const ResumeAnalysisPage = () => {
  const [jdText, setJdText] = useState("");
  const [file, setFile] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  const fileInputRef = useRef();
  const navigate = useNavigate();

  // Replace with actual userId from auth context
  const userId = "demoUser";

  const fetchHistory = async () => {
    try {
      const response = await axios.get(`/api/resume/history?userId=${userId}`);
      setHistory(response.data);
    } catch (err) {
      console.error("Failed to fetch resume history", err);
      setHistory([]);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [userId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !jdText) {
      alert("Please provide both Job Description and Resume file.");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("job_description", jdText);
    formData.append("userId", userId);

    try {
      const res = await axios.post("/api/resume", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setAnalysisResult(res.data);
      fetchHistory(); // Refresh history after new analysis
    } catch (err) {
      console.error("Error analyzing resume:", err);
      setAnalysisResult({ error: "Resume analysis failed." });
    }
    setLoading(false);
  };
  
  const handleDeleteClick = (item) => {
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      const payload = { userId, docId: itemToDelete.docId };
      await axios.post("/api/resume/history/delete", payload);

      // Optimistically remove the item from local state
      setHistory((prevHistory) =>
        prevHistory.filter((item) => item.docId !== itemToDelete.docId)
      );
      alert("History entry deleted successfully.");
    } catch (err) {
      console.error("Failed to delete history entry:", err);
      alert("Failed to delete history entry.");
    } finally {
      setShowDeleteModal(false);
      setItemToDelete(null);
    }
  };

  const getSuggestions = () => {
    if (!analysisResult) return [];
    const suggestions = [];
    if (analysisResult.grammar_issues?.length) {
      suggestions.push("Fix grammar and spelling issues.");
    }
    if (analysisResult.missing_keywords?.length) {
      suggestions.push("Add missing keywords to better match the job description.");
    }
    if ((analysisResult.ats_score || 0) < 70) {
      suggestions.push("Improve ATS score: optimize formatting and add measurable achievements.");
    }
    if ((analysisResult.similarity_with_jd || 0) < 50) {
      suggestions.push("Tailor your resume more closely to the job description.");
    }
    return suggestions;
  };

  // helper to clamp percent values to 0-100
  const clamp = (val) => {
    const n = Number(val) || 0;
    return Math.min(100, Math.max(0, Math.round(n)));
  };

  return (
    <Container className="py-5">
      <Button variant="outline-primary" className="mb-4" onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
      <Card className="mb-4 shadow">
        <Card.Body>
          <Card.Title as="h2" className="mb-4">Resume Analysis</Card.Title>
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3" controlId="jdText">
              <Form.Label>Job Description</Form.Label>
              <Form.Control
                as="textarea"
                rows={4}
                placeholder="Paste Job Description here..."
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
              />
            </Form.Group>
            <Form.Group className="mb-3" controlId="resumeFile">
              <Form.Label>Resume File (.pdf, .doc, .docx)</Form.Label>
              <Form.Control
                type="file"
                accept=".pdf,.doc,.docx"
                ref={fileInputRef}
                onChange={(e) => setFile(e.target.files[0])}
              />
            </Form.Group>
            <Button variant="success" type="submit" disabled={loading}>
              {loading ? <Spinner animation="border" size="sm" className="me-2" /> : null}
              {loading ? "Analyzing..." : "Analyze Resume"}
            </Button>
          </Form>
        </Card.Body>
      </Card>

      {analysisResult && !analysisResult.error && (
        <Card className="mb-4 shadow">
          <Card.Body>
            <Card.Title as="h3" className="mb-3">Analysis Results</Card.Title>
            <div className="mb-3">
              <strong>Skills Found:</strong>
              <div className="mt-2">
                {(analysisResult.skills_found || []).length > 0 ? (
                  analysisResult.skills_found.map((skill) => (
                    <span
                      key={skill}
                      className="badge bg-primary me-2 mb-2"
                    >
                      {skill}
                    </span>
                  ))
                ) : (
                  <span className="text-muted">No skills detected</span>
                )}
              </div>
            </div>
            <div className="d-flex gap-4 mb-3">
              <div className="flex-fill">
                <strong>Score:</strong>
                <div className="fs-4 fw-bold">{`${clamp(analysisResult.score ?? 0)}/100`}</div>
              </div>
              <div className="flex-fill">
                <strong>Similarity with JD:</strong>
                <div className="d-flex align-items-center gap-2">
                  <div className="w-100 bg-light rounded" style={{ height: "1rem" }}>
                    <div
                      className="bg-success rounded"
                      style={{ height: "1rem", width: `${clamp(analysisResult.similarity_with_jd || 0)}%` }}
                    ></div>
                  </div>
                  <span className="ms-2 fw-bold">{clamp(analysisResult.similarity_with_jd || 0)}%</span>
                </div>
              </div>
              <div className="flex-fill">
                <strong>ATS Score:</strong>
                <div className="d-flex align-items-center gap-2">
                  <div className="w-100 bg-light rounded" style={{ height: "1rem" }}>
                    <div
                      className="bg-warning rounded"
                      style={{ height: "1rem", width: `${clamp(analysisResult.ats_score || 0)}%` }}
                    ></div>
                  </div>
                  <span className="ms-2 fw-bold">{clamp(analysisResult.ats_score || 0)}%</span>
                </div>
              </div>
            </div>
            <div className="mb-3">
              <strong>Missing Keywords:</strong>
              <div className="mt-2">
                {analysisResult.missing_keywords?.length ? (
                  analysisResult.missing_keywords.map((kw) => (
                    <span
                      key={kw}
                      className="badge bg-danger me-2 mb-2"
                    >
                      {kw}
                    </span>
                  ))
                ) : (
                  <span className="text-success">No missing keywords!</span>
                )}
              </div>
            </div>
            <div className="mb-3">
              <strong>Suggestions to Improve Resume:</strong>
              <ul className="ms-3">
                {getSuggestions().length ? (
                  getSuggestions().map((s, idx) => <li key={idx}>{s}</li>)
                ) : (
                  <li>No suggestions. Great job!</li>
                )}
              </ul>
            </div>
            <div className="mb-3">
              <Button
                variant="outline-secondary"
                className="mb-2"
                onClick={() => setPreviewOpen((v) => !v)}
              >
                {previewOpen ? "Hide" : "Show"} Resume Preview
              </Button>
              {previewOpen && (
                <pre className="bg-light p-2 rounded border" style={{ maxHeight: "24rem", overflow: "auto" }}>
                  {analysisResult.text_preview}
                </pre>
              )}
            </div>
          </Card.Body>
        </Card>
      )}

      {analysisResult?.error && (
        <Card className="mb-4 shadow border-danger">
          <Card.Body>
            <span className="text-danger">{analysisResult.error}</span>
          </Card.Body>
        </Card>
      )}

      <Card className="mb-4 shadow">
        <Card.Body>
          <Card.Title as="h3" className="mb-3">History</Card.Title>
          <Table striped bordered responsive className="mb-0">
            <thead>
              <tr>
                <th>Date</th>
                <th>Score</th>
                <th>Similarity</th>
                <th>ATS Score</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.length ? (
                history.map((h, idx) => (
                  <tr key={h.docId}>
                    <td>{new Date(h.timestamp?._seconds * 1000).toLocaleString()}</td>
                    <td>{clamp(h.score)}</td>
                    <td>{clamp(h.similarity_with_jd)}%</td>
                    <td>{clamp(h.ats_score)}%</td>
                    <td>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeleteClick(h)}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="text-center">No history found.</td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Confirm Deletion</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete this history entry? This action cannot be undone.
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

export default ResumeAnalysisPage;