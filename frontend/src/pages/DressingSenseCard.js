import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
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

// --- Re-define useDressingSenseLogic for clarity and reliability ---
const useDressingSenseLogic = (userId) => {
  const [history, setHistory] = useState([]);
  const historyRef = useRef(history);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState("timestamp");
  const [sortDirection, setSortDirection] = useState("desc");
  const [showLatestOnly, setShowLatestOnly] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  // Helper: normalize server entry shape (adjusting for backend save keys)
  const normalizeEntry = (d) => {
    // support nested shapes and various timestamp keys from simulated/backends
    const docId = d?.id || d?.docId || d?.sessionId || d?._id || (d?.save_info && d.save_info.docId) || (d?.saveInfo && d.saveInfo.docId) || null;
    const score = d?.score ?? d?.averageScore ?? d?.dressScore ?? d?.rating ?? (d?.data && (d.data.score ?? d.data.dressScore)) ?? null;
    const feedback = d?.feedback ?? d?.message ?? d?.summary ?? (d?.data && (d.data.feedback || d.data.message)) ?? '';
    const timestamp = d?.serverTimestamp ?? d?.saved_at ?? d?.savedAt ?? d?.server_time ?? d?.timestamp ?? d?.createdAt ?? d?.startedAt ?? (d?.data && (d.data.serverTimestamp || d.data.timestamp)) ?? null;

    return {
      docId,
      score,
      feedback,
      timestamp,
      optimistic: !!(d?.optimistic || d?.saving || d?._optimistic)
    };
  };

  const fetchDressingHistory = useCallback(async () => {
    setIsHistoryLoading(true);
    try {
      const resp = await axios.get(`/api/dress/history`, { params: { userId } });
      
      // Assuming the backend history endpoint returns an array of documents (data)
      if (resp && resp.data) {
        const data = resp.data.data ?? resp.data.sessions ?? resp.data;
        const arr = Array.isArray(data) ? data : [];
        const normalized = arr.map(normalizeEntry);
        // If the backend returned at least one authoritative record, reconcile optimistic entries.
        if (normalized.length > 0) {
          try {
            // Find optimistic local entries
            const optimisticLocal = historyRef.current.filter(h => !!h.optimistic);

            // Build final list starting from server records
            const finalList = [...normalized];

            // Helper to simplify feedback for matching
            const simplify = (s) => (s || '').toString().replace(/[\s\n]+/g, ' ').replace(/[\W_]+/g, ' ').toLowerCase().trim().slice(0, 120);

            // For each optimistic local entry, try to find a match in server records by score and feedback similarity
            optimisticLocal.forEach(opt => {
              const optScore = opt.score;
              const optFeedback = simplify(opt.feedback);
              let matched = false;
              for (const srv of normalized) {
                if (srv && srv.score != null && optScore != null && srv.score === optScore) {
                  const srvFeedback = simplify(srv.feedback);
                  if (srvFeedback && optFeedback && (srvFeedback.startsWith(optFeedback) || optFeedback.startsWith(srvFeedback) || srvFeedback.includes(optFeedback) || optFeedback.includes(srvFeedback))) {
                    matched = true;
                    break;
                  }
                }
              }
              if (!matched) {
                // keep optimistic entry if no matching server record was found
                finalList.push(opt);
              }
            });

            setHistory(finalList);
          } catch (e) {
            console.error('Failed to reconcile optimistic entries', e);
            setHistory(normalized);
          }
        } else {
          // No authoritative records returned; keep any optimistic local entries instead of clearing them.
          // This preserves immediate UI feedback when the server hasn't persisted entries yet.
        }
      } else {
        // Do not overwrite existing history on empty/invalid responses; preserve optimistic entries.
      }
    } catch (err) {
      console.error('Failed to fetch dress history', err);
      // Preserve existing history on error to avoid removing optimistic entries unexpectedly.
    } finally {
      setIsHistoryLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchDressingHistory();
  }, [fetchDressingHistory]);

  // keep a ref to the latest history to avoid capturing it in fetchDressingHistory's deps
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      // Determine the identifier to delete. Backend accepts docId or sessionId.
      const docIdToDelete = itemToDelete?.docId || itemToDelete?.sessionId || itemToDelete?.id || null;

      if (!docIdToDelete) {
        // Nothing to send to server — remove locally and warn the user that server deletion was skipped.
        setHistory((prevHistory) => prevHistory.filter((it) => it !== itemToDelete));
        alert('Local entry removed (no server id available).');
        return;
      }

      // Use POST to delete via backend as requested
      const resp = await axios.post('/api/dress/history/delete', { userId, docId: docIdToDelete });

      // Optimistically update local history on success
      if (resp && (resp.data?.success || resp.status === 200)) {
        setHistory((prevHistory) => prevHistory.filter((it) => it.docId !== docIdToDelete && it.id !== docIdToDelete && it.sessionId !== docIdToDelete));
      } else {
        throw new Error('Server did not confirm deletion');
      }
    } catch (err) {
      console.error('Failed to delete history entry:', err);
      const backendMessage = err?.response?.data?.error || err?.response?.data?.message || err?.message;
      alert('Failed to delete history entry: ' + backendMessage);
    } finally {
      setShowDeleteModal(false);
      setItemToDelete(null);
    }
  };

  // Allow callers to optimistically prepend a history entry (raw shape expected)
  const prependHistory = (rawEntry) => {
    try {
      setHistory((prev) => [normalizeEntry(rawEntry), ...prev]);
    } catch (e) {
      console.error('Failed to prepend history entry', e);
    }
  };
  
  const clamp = (val) => Math.min(100, Math.max(0, Math.round(Number(val) || 0)));

  // Memoized filtered and sorted history
  const processedHistory = useMemo(() => {
    let filtered = history;
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((item) => {
        const scoreStr = String(item.score ?? "");
        const dateStr = item.timestamp?._seconds ? new Date(item.timestamp._seconds * 1000).toLocaleString().toLowerCase() : "";
        const feedbackStr = item.feedback?.toLowerCase() || "";
        return scoreStr.includes(term) || dateStr.includes(term) || feedbackStr.includes(term);
      });
    }

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
    fetchDressingHistory,
    prependHistory
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
    prependHistory,
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

    const oldPreview = preview;
    const newPreview = URL.createObjectURL(f);
    setPreview(newPreview);
    if (oldPreview) URL.revokeObjectURL(oldPreview);

    const fd = new FormData();
    fd.append('file', f);
    fd.append('userId', userId);

    try {
      setLoading(true);
      const resp = await axios.post('/api/proxy-dress-analysis', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        // Increase client timeout to 120s to match server/LLM processing time
        timeout: 120000
      });

      const respRoot = resp.data || {};
      const analysis = respRoot.analysis || respRoot;
      const saveInfo = respRoot.save_info || respRoot.saveInfo || analysis.save_info || analysis.saveInfo || respRoot;

      let docIdCandidate = saveInfo?.docId || respRoot?.docId || analysis?.docId || analysis?.sessionId || null;
      const score = analysis?.score ?? analysis?.dressScore ?? analysis?.rating ?? null;
      const feedback = analysis?.feedback ?? analysis?.message ?? analysis?.comment ?? '';

      // If backend didn't provide a docId, create a temporary one and mark optimistic
      let tempId = null;
      if (!docIdCandidate) {
        tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
      }
      const finalDocId = docIdCandidate || tempId;
      const optimistic = !docIdCandidate;

      // Build a raw history shape compatible with normalizeEntry and prepend optimistically
      if (finalDocId) {
        const newRaw = {
          id: finalDocId,
          docId: finalDocId,
          score,
          feedback,
          serverTimestamp: new Date().toISOString(),
          optimistic: optimistic
        };
        prependHistory(newRaw);
      }

      setResult({ score, feedback, raw: analysis });

      // Refresh history in background
      fetchDressingHistory();

    } catch (err) {
      console.error('Dress analysis error:', err);
      const backendError = err?.response?.data?.error || err?.response?.data?.message;
      setError(backendError || err.message || 'Dress analysis failed');
    } finally {
      setLoading(false);
    }
  };

  // Export and Delete Handlers (unchanged)
  const handleExport = () => {
    if (!history.length) return;
    const headers = ["Date", "Score", "Feedback"];
    const rows = history.map((h) => {
      let dateStr = h.timestamp?._seconds ? new Date(h.timestamp._seconds * 1000).toLocaleString() : new Date(h.timestamp).toLocaleString();
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
                        {result && result.score != null ? (
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

      {/* NEW: Professional Styling Tips Card */}
      <Card className='mb-4 shadow'>
        <Card.Body>
          <Card.Title as='h3' className='mb-3'>💼 Professional Styling Tips</Card.Title>
          <Row>
            <Col md={4} className='mb-3'>
              <Alert variant='success' className='mb-0'>
                <strong>Focus on Fit:</strong> Tailored clothing looks polished. A well-fitted jacket and trousers are essential for a professional impression.
              </Alert>
            </Col>
            <Col md={4} className='mb-3'>
              <Alert variant='info' className='mb-0'>
                <strong>Keep Colors Neutral:</strong> Stick to navy, charcoal gray, or black for primary pieces. Accent with a clean white or light blue shirt.
              </Alert>
            </Col>
            <Col md={4} className='mb-3'>
              <Alert variant='warning' className='mb-0'>
                <strong>Avoid Casual Fabrics:</strong> Materials like linen, straw (hats), denim, or short sleeves are often too casual for a strict corporate interview.
              </Alert>
            </Col>
          </Row>
        </Card.Body>
      </Card>
      
      {/* History Card */}
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
                          disabled={!!h.optimistic}
                        >
                          Delete
                        </Button>
                        {h.optimistic && <Badge bg="secondary" className="ms-2">Saving...</Badge>}
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
      
      {/* Delete Confirmation Modal */}
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