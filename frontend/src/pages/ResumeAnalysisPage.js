import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import api from "../api/config";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Card,
  Form,
  Button,
  Table,
  Spinner,
  Modal,
  Row,
  Col,
  Alert,
  Badge
} from "react-bootstrap";
import { getAuth } from 'firebase/auth';
// Import Firestore dependencies directly
import { collection, query, where, orderBy, getDocs, deleteDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore'; 
import { db } from '../firebase';


// Helper function to safely format dates from Firestore Timestamp
const formatDate = (timestamp) => {
  if (!timestamp) return "N/A";
  
  try {
    // Handle Firestore Timestamp objects
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        return timestamp.toDate().toLocaleString();
    } else if (timestamp.seconds || timestamp._seconds) {
        const seconds = timestamp.seconds || timestamp._seconds;
        return new Date(seconds * 1000).toLocaleString();
    } else {
        const d = new Date(timestamp);
        return isNaN(d.getTime()) ? "N/A" : d.toLocaleString();
    }
  } catch (err) {
    console.error("Error formatting date:", err);
    return "N/A";
  }
};


// 🚨 REMOVED: CATEGORIES constant (was Line 45)
// 🚨 REMOVED: DIFFICULTIES constant (was Line 136)


const ResumeAnalysisPage = () => {
  const [jdText, setJdText] = useState("");
  const [file, setFile] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]); // HISTORY STATE MOVED HERE
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  // Advanced history management states
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState("timestamp");
  const [sortDirection, setSortDirection] = useState("desc");
  const [showLatestOnly, setShowLatestOnly] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const fileInputRef = useRef();
  const navigate = useNavigate();
  const auth = getAuth();
  const [user, setUser] = useState(null);

  // Get actual userId from Firebase auth
  const userId = user?.uid || null;

  // Helper to clamp percent values to 0-100 (kept local)
  const clamp = (val) => {
    const n = Number(val) || 0;
    return Math.min(100, Math.max(0, Math.round(n)));
  };

  // --- HISTORY FETCHING LOGIC ---
  const fetchHistory = useCallback(async () => {
    if (!userId) return;
    
    setIsHistoryLoading(true);
    try {
        const resumeSessionsRef = collection(db, 'resume_analysis');
        const q = query(
            resumeSessionsRef,
            where('userId', '==', userId),
            orderBy('timestamp', 'desc')
        );
        
        const querySnapshot = await getDocs(q);
        const fetchedData = [];
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            fetchedData.push({
                docId: doc.id,
                score: data.score,
                similarity_with_jd: data.similarity_with_jd,
                ats_score: data.ats_score,
                timestamp: data.timestamp,
                job_description_preview: data.job_description_preview || '',
            });
        });
        
        setHistory(fetchedData);
    } catch (err) {
        console.error('❌ Failed to fetch resume history from Firestore:', err);
    } finally {
        setIsHistoryLoading(false);
    }
  }, [userId]);
  // --- END HISTORY FETCHING LOGIC ---


  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        navigate('/auth');
      }
    });
    return () => unsubscribe();
  }, [auth, navigate]);

  // Fetch history when user changes or component mounts
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);
  
  // --- DELETE LOGIC ---
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      const docIdToDelete = itemToDelete.docId;

      if (!docIdToDelete) {
          alert('Cannot delete: No document ID available.');
          setShowDeleteModal(false);
          setItemToDelete(null);
          return;
      }
      
      const docRef = doc(db, 'resume_analysis', docIdToDelete);
      await deleteDoc(docRef);
      
      // Optimistically update local state
      setHistory((prevHistory) => prevHistory.filter((it) => 
          it.docId !== docIdToDelete
      ));
      
    } catch (err) {
      console.error("Failed to delete history entry:", err);
      alert("Failed to delete history entry.");
    } finally {
      setShowDeleteModal(false);
      setItemToDelete(null);
    }
  };
  // --- END DELETE LOGIC ---


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
      // 1. Call the backend proxy for analysis
      const res = await api.post("/api/resume", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const result = res.data;
      setAnalysisResult(result);
      
      // 2. Save the result to Firestore
      if (result && result.text_preview) { 
          const resumeSessionsRef = collection(db, 'resume_analysis');
          await addDoc(resumeSessionsRef, {
              userId: userId,
              timestamp: serverTimestamp(),
              score: result.score,
              similarity_with_jd: result.similarity_with_jd,
              ats_score: result.ats_score,
              job_description_preview: jdText.substring(0, 100) + '...',
          });
      }
      
      // 3. Refresh history from Firestore
      fetchHistory(); 

    } catch (err) {
      console.error("Error analyzing resume:", err);
      setAnalysisResult({ error: err.response?.data?.error || err.message || "Resume analysis failed." });
    }
    setLoading(false);
  };
  
  const handleDeleteClick = (item) => {
    setItemToDelete(item);
    setShowDeleteModal(true);
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


  // Memoized filtered and sorted history 
  const processedHistory = useMemo(() => {
    let filtered = history;
    
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = filtered.filter((item) => {
            const scoreStr = String(item.score ?? "");
            // Handle different timestamp access for searching
            const dateVal = item.timestamp?.toDate ? item.timestamp.toDate() : (item.timestamp?._seconds ? new Date(item.timestamp._seconds * 1000) : null);
            const dateStr = dateVal ? dateVal.toLocaleString().toLowerCase() : "";
            const similarityStr = String(item.similarity_with_jd ?? "");
            const atsStr = String(item.ats_score ?? "");
            return scoreStr.includes(term) || dateStr.includes(term) || similarityStr.includes(term) || atsStr.includes(term);
        });
    }

    filtered = [...filtered].sort((a, b) => {
        let aVal = a[sortKey];
        let bVal = b[sortKey];
        
        if (sortKey === "timestamp") {
            // Handle Firestore timestamp objects for sorting (sort by seconds value)
            aVal = a.timestamp?.seconds || a.timestamp?._seconds || 0;
            bVal = b.timestamp?.seconds || b.timestamp?._seconds || 0;
        }
        // Ensure numeric fields are treated as numbers
        if (['score', 'ats_score', 'similarity_with_jd'].includes(sortKey)) {
            aVal = Number(aVal) || 0;
            bVal = Number(bVal) || 0;
        }
        
        if (sortDirection === "asc") {
            return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        } else {
            return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
        }
    });
    
    // Latest only
    if (showLatestOnly && filtered.length) {
        return [filtered[0]];
    }

    return filtered;
  }, [history, searchTerm, sortKey, sortDirection, showLatestOnly]);


  // Export to CSV (using history data from the hook)
  const handleExport = () => {
    if (!processedHistory.length) return;
    const headers = ["Date", "Score", "Similarity", "ATS Score"];
    const rows = processedHistory.map((h) => {
      const dateStr = formatDate(h.timestamp);

      return [
        dateStr,
        clamp(h.score),
        clamp(h.similarity_with_jd) + "%",
        clamp(h.ats_score) + "%",
      ];
    });
    let csv = headers.join(",") + "\n" + rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "resume_analysis_history.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

      {/* NEW: Resume Optimization Tips */}
      <Card className='mb-4 shadow'>
        <Card.Body>
          <Card.Title as='h3' className='mb-3'>✍️ Resume Optimization Tips</Card.Title>
          <Row>
            <Col md={4} className='mb-3'>
              <Alert variant='success' className='mb-0'>
                <strong>Tailor Keywords:</strong> Mirror the job description's exact terminology to pass ATS filters.
              </Alert>
            </Col>
            <Col md={4} className='mb-3'>
              <Alert variant='info' className='mb-0'>
                <strong>Use Metrics:</strong> Replace general duties with quantifiable achievements (e.g., "Increased sales by 15%").
              </Alert>
            </Col>
            <Col md={4} className='mb-3'>
              <Alert variant='warning' className='mb-0'>
                <strong>Maintain Formatting:</strong> Use clear headings, standard fonts, and avoid complex graphics to ensure ATS compatibility.
              </Alert>
            </Col>
          </Row>
        </Card.Body>
      </Card>
      {/* END NEW TIPS */}

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
          {/* Advanced Controls */}
          <div className="d-flex flex-wrap gap-3 mb-3 align-items-center">
            <Form.Control
              type="text"
              placeholder="Search by score or date..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ maxWidth: 220 }}
            />
            <Form.Select
              value={sortKey}
              onChange={e => setSortKey(e.target.value)}
              style={{ maxWidth: 160 }}
            >
              <option value="timestamp">Sort by Date</option>
              <option value="score">Sort by Score</option>
              <option value="ats_score">Sort by ATS Score</option>
              <option value="similarity_with_jd">Sort by Similarity</option>
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
                <th>Score</th>
                <th>Similarity</th>
                <th>ATS Score</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isHistoryLoading ? (
                <tr>
                  <td colSpan={5} className="text-center">
                    <Spinner animation="border" size="sm" className="me-2" /> Loading...
                  </td>
                </tr>
              ) : processedHistory.length ? (
                processedHistory.map((h, idx) => {
                  const dateStr = formatDate(h.timestamp);

                  return (
                    <tr key={h.docId}>
                      <td>{dateStr}</td>
                      <td>
                        <Badge bg="primary">{clamp(h.score)}/100</Badge>
                      </td>
                      <td>
                        <Badge bg="success">{clamp(h.similarity_with_jd)}%</Badge>
                      </td>
                      <td>
                        <Badge bg="warning">{clamp(h.ats_score)}%</Badge>
                      </td>
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
                  );
                })
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