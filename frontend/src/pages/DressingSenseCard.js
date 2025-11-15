import React, { useState, useRef, useMemo, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Card,
  Button,
  Spinner,
  Alert,
  ProgressBar,
  Image,
  Row,
  Col,
  Form,
  Table,
  Modal,
  Badge
} from 'react-bootstrap';

// --- Placeholder/Mock Data and Logic (Replace with actual API calls) ---
// Since we don't have the actual Firestore connection in React, we simulate it
// Use the same structure as Resume and Posture history items
const mockHistoryData = [
  { docId: 'ds1', score: 85, feedback: 'Excellent professional attire. Great job on the tie selection!', timestamp: { _seconds: Date.now() / 1000 - 86400 } },
  { docId: 'ds2', score: 68, feedback: 'The jacket fit is too loose. Consider tailoring.', timestamp: { _seconds: Date.now() / 1000 - 3600 } },
  { docId: 'ds3', score: 92, feedback: 'Perfect score. Highly professional and polished.', timestamp: { _seconds: Date.now() / 1000 - 7200 } },
];

const useDressingSenseLogic = (userId) => {
  const [history, setHistory] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState("timestamp");
  const [sortDirection, setSortDirection] = useState("desc");
  const [showLatestOnly, setShowLatestOnly] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  // GitHub Copilot Prompt for fetchHistory (Backend simulation)
  /*
  "In this React component using axios, create an async function `fetchDressingHistory`. This function should make a GET request to `/api/dress/history?userId=${userId}`. Set `isHistoryLoading` to true before the call and false in the finally block. On success, set the response data to the `history` state."
  */
  const fetchDressingHistory = async () => {
    setIsHistoryLoading(true);
    try {
      // Call backend dressing history endpoint
      const resp = await axios.get(`/api/dress/history`, { params: { userId } });
      // Backend may return { success, count, data } or an array directly
      if (resp && resp.data) {
        const data = resp.data.data ?? resp.data.sessions ?? resp.data;
        // Normalize entries to have docId, score, feedback, timestamp
        const normalized = (Array.isArray(data) ? data : []).map((d) => ({
          docId: d.id || d.docId || d.sessionId || (d._id || null),
          score: d.score ?? d.averageScore ?? d.rating ?? null,
          feedback: d.feedback ?? d.message ?? d.summary ?? '',
          timestamp: d.serverTimestamp ?? d.timestamp ?? d.createdAt ?? d.startedAt ?? null,
        }));
        setHistory(normalized);
      } else {
        setHistory([]);
      }
    } catch (err) {
      console.error('Failed to fetch dress history', err);
      // fallback to mock data to keep UI functional
      setHistory(mockHistoryData);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchDressingHistory();
  }, [userId]);

  // GitHub Copilot Prompt for handleConfirmDelete (Backend simulation)
  /*
  "In this React component using axios, create an async function `handleConfirmDelete`. This function should perform the delete action using the current `itemToDelete`. Make a POST request to `/api/dress/history/delete` with a payload of `{ userId, docId: itemToDelete.docId }`. On successful deletion, optimistically update the local `history` state by filtering out the deleted item. Finally, close the modal and reset `itemToDelete`."
  */
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      // Attempt to delete via backend. Prefer DELETE by docId if available.
      if (itemToDelete.docId) {
        await axios.delete(`/api/dress/history/${encodeURIComponent(itemToDelete.docId)}`);
      } else {
        // Fallback: POST delete with payload
        await axios.post('/api/dress/history/delete', { userId, docId: itemToDelete.docId });
      }

      // Optimistically update local history
      setHistory((prevHistory) => prevHistory.filter((it) => it.docId !== itemToDelete.docId));
      // Optionally show a small success UI (alert kept for parity)
      alert('History entry deleted successfully.');
    } catch (err) {
      console.error("Failed to delete history entry:", err);
      alert("Failed to delete history entry.");
    } finally {
      setShowDeleteModal(false);
      setItemToDelete(null);
    }
  };
  
  const clamp = (val) => {
    const n = Number(val) || 0;
    return Math.min(100, Math.max(0, Math.round(n)));
  };

  // Memoized filtered and sorted history, similar to ResumeAnalysisPage.js
  const processedHistory = useMemo(() => {
    let filtered = history;
    
    // Filter by searchTerm (score, date)
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((item) => {
        const scoreStr = String(item.score ?? "");
        const dateStr = item.timestamp?._seconds ? new Date(item.timestamp._seconds * 1000).toLocaleString().toLowerCase() : "";
        const feedbackStr = item.feedback?.toLowerCase() || "";
        return scoreStr.includes(term) || dateStr.includes(term) || feedbackStr.includes(term);
      });
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      let aVal = a[sortKey];
      let bVal = b[sortKey];
      if (sortKey === "timestamp") {
        aVal = a.timestamp?._seconds || 0;
        bVal = b.timestamp?._seconds || 0;
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


  return {
    isHistoryLoading,
    history: processedHistory,
    searchTerm,
    setSearchTerm,
    sortKey,
    setSortKey,
    sortDirection,
    setSortDirection,
    showLatestOnly,
    setShowLatestOnly,
    handleConfirmDelete,
    setShowDeleteModal,
    showDeleteModal,
    setItemToDelete,
    clamp,
    fetchDressingHistory // Allow the main component to refresh after analysis
  };
};

// --- Main Component ---
const DressingSensePage = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Replace with actual userId from auth context
  const userId = "demoUser";

  const {
    isHistoryLoading,
    history,
    searchTerm,
    setSearchTerm,
    sortKey,
    setSortKey,
    sortDirection,
    setSortDirection,
    showLatestOnly,
    setShowLatestOnly,
    handleConfirmDelete,
    setShowDeleteModal,
    showDeleteModal,
    setItemToDelete,
    clamp,
    fetchDressingHistory
  } = useDressingSenseLogic(userId);

  const scoreVariant = (s) => (s >= 80 ? 'success' : s >= 60 ? 'warning' : 'danger');

  const handleFileChange = async (e) => {
    setError(null);
    setResult(null);
    const f = e.target.files && e.target.files[0];
    if (!f) return;

    if (!f.type.startsWith('image/')) {
      setError('Please select a valid image file (JPEG or PNG).');
      return;
    }

    setPreview(URL.createObjectURL(f));

    const fd = new FormData();
    // Assuming the backend Flask service is expecting 'imageFile' as per the plan.
    fd.append('imageFile', f);

    try {
      setLoading(true);
      const resp = await axios.post('/api/proxy-dress-analysis', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60_000
      });

      if (resp && resp.data) {
        const data = resp.data;
        const score = data.posture_score ?? data.score ?? data.dressScore ?? data.rating ?? null;
        const feedback = data.feedback ?? data.message ?? data.comment ?? null;
        setResult({ score, feedback, raw: data });

        // Automatically save the final output to history (backend will persist if configured)
        try {
          await axios.post('/api/dress/save-session', {
            userId,
            sessionData: { score, feedback }
          });
        } catch (saveErr) {
          console.error('Failed to auto-save dress session:', saveErr?.response?.data || saveErr.message || saveErr);
        }

        // Refresh history after attempting to save
        await fetchDressingHistory();
      } else {
        setError('No response data from dress analysis service.');
      }
    } catch (err) {
      console.error('Dress analysis error:', err);
      setError(err?.response?.data?.error || err?.message || 'Dress analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!history.length) return;
    const headers = ["Date", "Score", "Feedback"];
    const rows = history.map((h) => {
      let dateStr = h.timestamp?._seconds ? new Date(h.timestamp._seconds * 1000).toLocaleString() : new Date(h.timestamp).toLocaleString();
      // Simple sanitization for feedback that might contain commas
      const cleanFeedback = (h.feedback || "").replace(/,/g, ';').replace(/\n/g, ' '); 
      return [
        dateStr,
        clamp(h.score),
        cleanFeedback,
      ];
    });
    let csv = headers.join(",") + "\n" + rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dressing_sense_history.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const handleDeleteClick = (item) => {
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  return (
    <Container className='py-5'>
      <Button variant="outline-primary" className="mb-4" onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
      
      {/* Main Analysis Card */}
      <Card className='mb-4 shadow'>
        <Card.Body>
          <Card.Title as='h2' className='mb-4'>Dressing Sense Analysis</Card.Title>
          <Row>
            {/* Input and Upload Controls */}
            <Col lg={6} className='mb-4 mb-lg-0'>
              <Card className='h-100'>
                <Card.Body>
                  <Card.Title as='h3' className='h5'>Image Upload</Card.Title>
                  <p className='text-muted mb-3'>Upload a clear photo (.jpeg/.png) of your upper body for attire analysis.</p>
                  
                  <Form.Group controlId='outfitFile' className='mb-3'>
                    <Form.Label>Outfit Image</Form.Label>
                    <Form.Control
                      type='file'
                      accept='image/jpeg,image/png'
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      disabled={loading}
                    />
                  </Form.Group>

                  <div className='d-flex justify-content-start gap-2'>
                    <Button variant='primary' onClick={() => fileInputRef.current.click()} disabled={loading}>
                      {loading ? (<><Spinner animation='border' size='sm' className='me-2'/>Analyzing...</>) : 'Analyze Outfit'}
                    </Button>
                  </div>

                  {error && <Alert variant='danger' className='mt-3 mb-0'>{error}</Alert>}
                </Card.Body>
              </Card>
            </Col>

            {/* Results Display */}
            <Col lg={6}>
              <Card className='h-100'>
                <Card.Body className='d-flex flex-column'>
                  <Card.Title as='h3' className='h5'>Analysis Results</Card.Title>
                  <div className='d-flex align-items-center justify-content-center bg-light rounded border flex-grow-1 p-3'>
                    {loading ? (
                       <div className='text-center'>
                         <Spinner animation='border' className='mb-2'/>
                         <p className='text-muted'>Sending to AI for analysis...</p>
                       </div>
                    ) : preview ? (
                      <div className='w-100 d-flex flex-column align-items-center'>
                         <Image src={preview} alt='preview' fluid rounded className='mb-3' style={{ maxHeight: 200, objectFit: 'contain' }} />
                        {result?.score !== null ? (
                          <div className='w-100 mt-2'>
                            <h6 className='fw-semibold mb-2'>Professionalism Score</h6>
                            <div className={`text-center fs-4 fw-bold mb-2 text-${scoreVariant(result.score)}`}>{Number(result.score).toFixed(1)} / 100</div>
                            <ProgressBar now={Number(result.score)} variant={scoreVariant(result.score)} className='mb-3' />
                            <h6 className='fw-semibold mb-2'>Feedback</h6>
                            <Alert variant='info' className='mb-0'><pre style={{whiteSpace:'pre-wrap', margin:0, background:'transparent', border:'none', padding:0}}>{result.feedback}</pre></Alert>
                          </div>
                        ) : (
                          <Alert variant='secondary' className='mb-0'>Ready to analyze. Click "Analyze Outfit".</Alert>
                        )}
                      </div>
                    ) : (
                      <div className='text-center text-muted'>Select an image to begin.</div>
                    )}
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Card.Body>
      </Card>
      
      {/* History Card - Styled like ResumeAnalysisPage */}
      <Card className='mb-4 shadow'>
        <Card.Body>
          <Card.Title as='h3' className='mb-3'>Dressing Sense History</Card.Title>
          <div className="d-flex flex-wrap gap-3 mb-3 align-items-center">
            <Form.Control
              type="text"
              placeholder="Search by score, date or feedback..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ maxWidth: 260 }}
            />
            <Form.Select
              value={sortKey}
              onChange={e => setSortKey(e.target.value)}
              style={{ maxWidth: 160 }}
            >
              <option value="timestamp">Sort by Date</option>
              <option value="score">Sort by Score</option>
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
                <th>Feedback Preview</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isHistoryLoading ? (
                <tr>
                  <td colSpan={4} className="text-center">
                    <Spinner animation="border" size="sm" className="me-2" /> Loading...
                  </td>
                </tr>
              ) : history.length ? (
                history.map((h) => {
                  let dateStr = "";
                  if (h.timestamp?._seconds) {
                    dateStr = new Date(h.timestamp._seconds * 1000).toLocaleString();
                  } else if (h.timestamp) {
                    const d = new Date(h.timestamp);
                    dateStr = isNaN(d.getTime()) ? "" : d.toLocaleString();
                  }
                  const previewText = (h.feedback || "").length > 50 ? h.feedback.substring(0, 47) + '...' : h.feedback;
                  return (
                    <tr key={h.docId}>
                      <td>{dateStr}</td>
                      <td>
                         <Badge bg={scoreVariant(h.score)}>{clamp(h.score)}/100</Badge>
                      </td>
                      <td>{previewText}</td>
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
                  <td colSpan={4} className="text-center">No history found.</td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card.Body>
      </Card>
      
      {/* Delete Confirmation Modal - Copied from ResumeAnalysisPage */}
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

export default DressingSensePage;