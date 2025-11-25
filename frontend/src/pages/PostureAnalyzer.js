/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps */ 
// Disabling unused-vars as many variables/setters/functions are used within nested functions/hooks 
// that ESLint often misreports as unused, despite being essential.
// Disabling exhaustive-deps on useMemo as the dependencies are intentionally comprehensive for filtering/sorting.

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import { auth, db } from '../firebase'; // Import db
import api from '../api/config';
import {
  Container, Card, Button, Spinner, Alert, Row, Col,
  ProgressBar, Badge, Form, Table, Modal
} from 'react-bootstrap';
// 🌟 CRITICAL FIX: Import all necessary Firestore functions
import { collection, query, where, orderBy, getDocs, deleteDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore'; 


const PostureAnalyzer = () => {
  const navigate = useNavigate();

  // --- NEW STATE: Track current authenticated user
  const [currentUser, setCurrentUser] = useState(null); 
  // Live session state
  const [postureScore, setPostureScore] = useState(null);
  // FIX: Store image as an object {src: data_uri, key: timestamp} to force re-render/no-cache
  const [annotatedImage, setAnnotatedImage] = useState(null); 
  const [sessionScores, setSessionScores] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // History state
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState('serverTimestamp');
  const [sortDir, setSortDir] = useState('desc');
  const [showLatestOnly, setShowLatestOnly] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState(null);

  // Camera and capture refs
  const webcamRef = useRef(null);
  const captureIntervalRef = useRef(null);
  const analyzingRef = useRef(false); // synchronous mirror of isAnalyzing
  const pendingRef = useRef(false);   // indicates request in-flight

  // Camera device list
  const [deviceId, setDeviceId] = useState(null);
  const [availableCameras, setAvailableCameras] = useState([]);

  // Enumerate cameras on mount
  useEffect(() => {
    let mounted = true;
    async function loadDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!mounted) return;
        const cams = devices.filter(d => d.kind === 'videoinput');
        setAvailableCameras(cams);
        if (cams.length > 0) setDeviceId(prev => prev || cams[0].deviceId);
      } catch (err) {
        console.warn('enumerateDevices failed', err);
      }
    }
    loadDevices();
    return () => { mounted = false; };
  }, []);

  // --- HISTORY FETCHING LOGIC (Direct Firestore) ---
  const fetchHistory = useCallback(async (user) => {
    if (!user) return;
    setHistoryLoading(true);
    try {
      const postureSessionsRef = collection(db, 'posture_sessions');
      const q = query(
          postureSessionsRef,
          where('userId', '==', user.uid),
          orderBy('timestamp', 'desc') // Use timestamp field from Firestore
      );
      
      const querySnapshot = await getDocs(q);
      const fetchedData = [];
      
      querySnapshot.forEach((doc) => {
          const data = doc.data();
          fetchedData.push({
              id: doc.id,
              // Convert Firestore Timestamp object to a standard format for display/sorting
              serverTimestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : data.timestamp,
              averageScore: data.averageScore,
              totalAnalyses: data.totalAnalyses,
              userId: data.userId
          });
      });
      setHistory(fetchedData || []);
    } catch (err) {
      console.error('fetchHistory error', err);
      // NOTE: This will now catch "Insufficient Permissions" if Security Rules are wrong
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Auth state (loads history when available)
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
      if (user) {
        fetchHistory(user);
      } else {
        setHistory([]);
      }
    });
    return () => unsubscribe();
  }, [fetchHistory]); // Dependency on fetchHistory now ensures data is loaded

  // Delete session handlers (Direct Firestore)
  const handleDeleteClick = (entry) => {
    setSessionToDelete(entry);
    setShowDeleteModal(true);
  };
  const confirmDelete = async () => {
    if (!sessionToDelete) return;
    setDeleteLoading(sessionToDelete.id);
    try {
      const docRef = doc(db, 'posture_sessions', sessionToDelete.id);
      await deleteDoc(docRef);

      // Optimistically update local state
      setHistory(prev => prev.filter(h => h.id !== sessionToDelete.id));
      setShowDeleteModal(false);
      setSessionToDelete(null);
    } catch (err) {
      console.error('delete failed', err);
      alert('Delete failed: ' + err.message);
    } finally {
      setDeleteLoading(null);
    }
  };

  // Processed history (filter + sort + latest)
  const processedHistory = useMemo(() => {
    let filtered = history.filter(item => {
      if (!searchTerm) return true;
      const t = searchTerm.toLowerCase();
      // Ensure the timestamp used for sorting is used for searching
      const dateStr = item.serverTimestamp ? new Date(item.serverTimestamp).toLocaleString().toLowerCase() : '';
      return (item.averageScore + '').includes(t) || dateStr.includes(t);
    });

    filtered = filtered.slice().sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      let aVal = a[sortKey];
      let bVal = b[sortKey];
      if (sortKey === 'serverTimestamp') {
        aVal = new Date(a.serverTimestamp || 0).getTime();
        bVal = new Date(b.serverTimestamp || 0).getTime();
      }
      return aVal > bVal ? dir : aVal < bVal ? -dir : 0;
    });

    return showLatestOnly ? filtered.slice(0, 1) : filtered;
  }, [history, searchTerm, sortKey, sortDir, showLatestOnly]);

  // Send frame to backend; only run if analyzingRef.current === true and not pending
  const sendFrameForAnalysis = async (imageSrc) => {
    if (!imageSrc || !analyzingRef.current || pendingRef.current) return;
    pendingRef.current = true;
    try {
      const payloadBase64 = imageSrc.includes('base64,') ? imageSrc.split(',')[1] : imageSrc;
      const resp = await api.post('/api/posture', { image: payloadBase64 });
      const data = resp.data;

      // Only apply annotated image while still analyzing (guard out-of-order responses)
      if (data && data.annotated_image && analyzingRef.current) {
        // FIX: Set the image as a new object with a key to force re-render/no-cache
        setAnnotatedImage({ 
            src: `data:image/jpeg;base64,${data.annotated_image}`,
            key: Date.now() 
        });
      }

      // Append score only while analyzing
      if (data && typeof data.posture_score !== 'undefined' && analyzingRef.current) {
        setPostureScore(data.posture_score);
        setSessionScores(prev => [...prev, data.posture_score]);
      }
    } catch (err) {
      console.error('sendFrameForAnalysis error', err);
    } finally {
      pendingRef.current = false;
    }
  };

  // Capture loop at ~5 FPS
  useEffect(() => {
    if (isAnalyzing && webcamRef.current) {
      analyzingRef.current = true;
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);

      captureIntervalRef.current = setInterval(() => {
        if (!analyzingRef.current) return;
        try {
          // Lower image quality to 0.5 to reduce Base64 string size for faster transfer
          const shot = webcamRef.current.getScreenshot('image/jpeg', 0.5); 
          if (shot) sendFrameForAnalysis(shot);
        } catch (e) {
          console.error('capture error', e);
        }
      }, 500);

      const t0 = setTimeout(() => {
        if (analyzingRef.current) {
          // *** FIX: Lower image quality to 0.5 to reduce Base64 string size for faster transfer ***
          try { const s = webcamRef.current.getScreenshot('image/jpeg', 0.5); if (s) sendFrameForAnalysis(s); } catch (e) {}
        }
      }, 150);

      return () => {
        clearTimeout(t0);
        if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
        analyzingRef.current = false;
      };
    } else {
      analyzingRef.current = false;
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
    }
  }, [isAnalyzing, deviceId]);

  // toggle analysis start/stop (FIX for image persistence on stop)
  const toggleAnalysis = () => {
    if (isAnalyzing) {
      // STOP: immediately prevent further state changes from any in-flight responses
      analyzingRef.current = false;
      if (captureIntervalRef.current) { clearInterval(captureIntervalRef.current); captureIntervalRef.current = null; }

      // Explicitly and immediately clear all states that hold stale data
      setPostureScore(null); 
      setAnnotatedImage(null); 
      // Keep sessionScores so user can save
      setIsAnalyzing(false);
      
    } else {
      // START: reset scores for a fresh run
      setSessionScores([]);
      setPostureScore(null);
      setAnnotatedImage(null);
      pendingRef.current = false;

      setIsAnalyzing(true);
    }
  };

  // helper: wait for pending request to finish (with timeout)
  const waitForPendingToFinish = async (timeoutMs = 1000) => {
    const start = Date.now();
    while (pendingRef.current && (Date.now() - start) < timeoutMs) {
      await new Promise(r => setTimeout(r, 50));
    }
  };

  // end session and save: stop capture, wait for inflight, then save
  const endSessionAndSave = async () => {
    // Stop capturing immediately but keep sessionScores
    setIsAnalyzing(false);
    analyzingRef.current = false;
    if (captureIntervalRef.current) { clearInterval(captureIntervalRef.current); captureIntervalRef.current = null; }

    // wait briefly for last in-flight request
    await waitForPendingToFinish(1000);

    try {
      if (!sessionScores.length) { alert('No session data to save.'); return; }
      const avg = sessionScores.reduce((s, v) => s + v, 0) / sessionScores.length;
      if (!currentUser) { alert('User not authenticated.'); return; }
      
      // 🌟 NEW: Direct Firestore save
      const postureSessionsRef = collection(db, 'posture_sessions');
      await addDoc(postureSessionsRef, {
        userId: currentUser.uid,
        timestamp: serverTimestamp(),
        averageScore: +avg.toFixed(2), 
        totalAnalyses: sessionScores.length,
      });

      alert('Session saved successfully!');
      
      // refresh history
      await fetchHistory(currentUser); 
      
      // Clear all state after successful save
      setSessionScores([]); 
      setPostureScore(null); 
      setAnnotatedImage(null); 
      
    } catch (err) {
      console.error('endSessionAndSave error', err);
      alert('Failed to save session.');
    }
  };

  const scoreVariant = (s) => s >= 80 ? 'success' : s >= 60 ? 'warning' : 'danger';

  // export session CSV (current live session)
  const exportSessionCSV = () => {
    if (!sessionScores.length) return;
    const headers = ['Timestamp', 'Score'];
    const rows = sessionScores.map(s => [new Date().toISOString(), s]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'posture_session.csv'; a.click(); URL.revokeObjectURL(url);
  };

  // export history CSV
  const exportHistoryCSV = () => {
    if (!processedHistory.length) return;
    const headers = ['Date', 'Avg Score', 'Analyses'];
    const rows = processedHistory.map(h => [new Date(h.serverTimestamp).toLocaleString(), h.averageScore, h.totalAnalyses]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'posture_history.csv'; a.click(); URL.revokeObjectURL(url);
  };

  const videoConstraints = deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } : { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' };

  return (
    <Container className='py-5'>
      <div className='text-center mb-4'>
        <h1 className='display-5'>Posture Analyzer</h1>
        <p className='text-muted lead mb-0'>Real-time posture feedback during practice.</p>
      </div>

      <div className='mb-3 d-flex gap-2'>
        <Button variant='outline-primary' onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
        {availableCameras.length > 1 && (
          <Form.Select value={deviceId || ''} onChange={e => setDeviceId(e.target.value)} style={{ maxWidth: 240 }}>
            {availableCameras.map(c => <option key={c.deviceId} value={c.deviceId}>{c.label || `Camera ${c.deviceId}`}</option>)}
          </Form.Select>
        )}
      </div>

      {/* Live session card */}
      <Card className='mb-4 shadow'>
        <Card.Body>
          <Card.Title as='h3' className='mb-4'>Live Posture Session</Card.Title>
          <Row>
            <Col lg={6} className='mb-4 mb-lg-0'>
              <Card className='h-100'>
                <Card.Body className='d-flex flex-column'>
                  <Card.Title as='h3' className='h5'>Live Camera Feed</Card.Title>
                  <div className='position-relative flex-grow-1 d-flex align-items-center justify-content-center bg-dark rounded mb-3 overflow-hidden'>
                    
                    {isAnalyzing ? (
                      <Webcam
                        ref={webcamRef}
                        audio={false}
                        screenshotFormat='image/jpeg'
                        mirrored={false}
                        videoConstraints={videoConstraints}
                        className='w-100 h-auto rounded'
                      />
                    ) : (
                      <div className='text-center text-white-50 p-5'><p className='mb-0'>Click "Start Analysis" to begin</p></div>
                    )}

                    {isAnalyzing && (
                      <div className='position-absolute top-0 start-0 m-2'>
                        <Badge bg='danger' className='d-flex align-items-center'>
                          <Spinner as='span' animation='grow' size='sm' className='me-1'/> LIVE
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Buttons: Start/Stop (primary/danger) and End Session & Save (red) placed to right */}
                  <div className='d-flex justify-content-center gap-2 align-items-center'>
                    <Button variant='outline-primary'
                            onClick={toggleAnalysis}
                            className='px-4'
                            disabled={availableCameras.length === 0}>
                      {isAnalyzing ? 'Stop Analysis' : 'Start Analysis'}
                    </Button>

                    <Button variant='outline-danger'
                            className='ms-2'
                            onClick={endSessionAndSave}
                            disabled={isAnalyzing || sessionScores.length === 0}
                            title={sessionScores.length === 0 ? 'No session data to save' : isAnalyzing ? 'Stop analysis before saving' : 'Save session to history'}>
                      End Session & Save
                    </Button>
                  </div>

                  {isAnalyzing && (
                    <Alert variant='info' className='mt-3 text-center py-2 mb-0'>
                      <Spinner animation='border' size='sm' className='me-2'/>Analyzing posture.
                    </Alert>
                  )}
                </Card.Body>
              </Card>
            </Col>

            <Col lg={6}>
              <Card className='h-100'>
                <Card.Body className='d-flex flex-column'>
                  <Card.Title as='h3' className='h5'>Analysis Results</Card.Title>

                  <div className='mb-4'>
                    <h6 className='fw-semibold mb-2'>Live Posture Score</h6>
                    {postureScore !== null ? (
                      <div>
                        <div className={`text-center fs-4 fw-bold mb-2 text-${scoreVariant(postureScore)}`}>{postureScore.toFixed(2)} / 100</div>
                        <ProgressBar now={postureScore} variant={scoreVariant(postureScore)} animated/>
                      </div>
                    ) : (
                      // Display a prompt when not analyzing and score is null
                      <Alert variant='secondary' className='text-center py-2 mb-0'>{isAnalyzing ? 'Acquiring score...' : 'Start analysis to see live score'}</Alert>
                    )}
                  </div>

                  <div className='mb-4'>
                    <h6 className='fw-semibold mb-2'>Live Annotated Image</h6>
                    {/* FIX: Use the key to force re-render/no-cache when the source changes */}
                    {annotatedImage ? (
                      <Card.Img key={annotatedImage.key} src={annotatedImage.src} alt='Live Posture Analysis' className='rounded border'/>
                    ) : (
                      // Display a placeholder when image is null
                      <div className='d-flex align-items-center justify-content-center bg-light rounded border flex-grow-1' style={{minHeight:'200px'}}>
                        <p className='text-muted m-0'>{isAnalyzing ? 'Waiting for analysis.' : 'Annotated image will appear here'}</p>
                      </div>
                    )}
                  </div>

                  {/* Only show Session Summary if there are scores to show */}
                  {sessionScores.length > 0 && (
                    <div>
                      <h6 className='fw-semibold mb-2'>Session Summary</h6>
                      <Row>
                        <Col sm={6} className='mb-3 mb-sm-0'>
                          <Card bg='light' className='h-100'><Card.Body className='text-center py-3'><div className='fs-3 fw-bold mb-1'>{sessionScores.length}</div><div className='text-muted small text-uppercase'>Analyses</div></Card.Body></Card>
                        </Col>
                        <Col sm={6}>
                          <Card bg='light' className='h-100'><Card.Body className='text-center py-3'><div className='fs-3 fw-bold mb-1'>{(sessionScores.reduce((s,v)=>s+v,0)/sessionScores.length).toFixed(1)}%</div><div className='text-muted small text-uppercase'>Avg. Score</div></Card.Body></Card>
                        </Col>
                      </Row>

                      <div className='d-flex gap-2 mt-3'>
                        <Button variant='outline-secondary' onClick={exportSessionCSV}>Export Session CSV</Button>
                      </div>
                    </div>
                  )}

                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Tips */}
      <Card className='mb-4 shadow'>
        <Card.Body>
          <Card.Title as='h3' className='mb-3'>🧘 Posture Tips</Card.Title>
          <Row>
            <Col md={4} className='mb-3'><Alert variant='success' className='mb-0'><strong>Sit Up Straight:</strong> Keep your back straight and shoulders relaxed.</Alert></Col>
            <Col md={4} className='mb-3'><Alert variant='info' className='mb-0'><strong>Eye Level:</strong> Position your camera at eye level to maintain good posture.</Alert></Col>
            <Col md={4} className='mb-3'><Alert variant='warning' className='mb-0'><strong>Shoulders Back:</strong> Consciously avoid slouching forward during the interview.</Alert></Col>
          </Row>
        </Card.Body>
      </Card>

      {/* History */}
      <Card className='mb-4 shadow'>
        <Card.Body>
          <Card.Title as='h3' className='mb-3'>Posture Session History</Card.Title>
          <div className="d-flex flex-wrap gap-3 mb-3 align-items-center">
            <Form.Control type="text" placeholder="Search by score or date." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ maxWidth: 280 }} />
            <Form.Select value={sortKey} onChange={e => setSortKey(e.target.value)} style={{ maxWidth: 160 }}>
              <option value="serverTimestamp">Sort by Date</option>
              <option value="averageScore">Sort by Avg Score</option>
              <option value="totalAnalyses">Sort by Analyses</option>
            </Form.Select>

            <Form.Select value={sortDir} onChange={e => setSortDir(e.target.value)} style={{ maxWidth: 120 }}>
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </Form.Select>

            <Form.Check type="switch" id="latest-only-toggle" label="Show Latest Only" checked={showLatestOnly} onChange={e => setShowLatestOnly(e.target.checked)} />

            <Button variant="outline-secondary" onClick={exportHistoryCSV}>Export</Button>
          </div>

          <Table striped bordered responsive className='mb-0'>
            <thead>
              <tr><th>Date</th><th>Avg Score</th><th>Analyses</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {historyLoading ? (
                <tr><td colSpan={4} className='text-center'><Spinner animation='border' size='sm' className='me-2'/> Loading...</td></tr>
              ) : processedHistory.length ? processedHistory.map(h => (
                <tr key={h.id}>
                  <td>{h.serverTimestamp ? new Date(h.serverTimestamp).toLocaleString() : 'N/A'}</td>
                  <td>{h.averageScore}%</td>
                  <td>{h.totalAnalyses}</td>
                  <td><Button size='sm' variant='outline-danger' onClick={() => handleDeleteClick(h)} disabled={deleteLoading === h.id}>{deleteLoading === h.id ? <Spinner size='sm' /> : 'Delete'}</Button></td>
                </tr>
              )) : (
                <tr><td colSpan={4} className='text-center text-muted'>No posture history yet. Start your first session above!</td></tr>
              )}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
        <Modal.Header closeButton><Modal.Title>Delete Posture Session</Modal.Title></Modal.Header>
        <Modal.Body>Are you sure you want to delete this posture session? This action cannot be undone.</Modal.Body>
        <Modal.Footer>
          <Button variant='secondary' onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button variant='danger' onClick={confirmDelete} disabled={!!deleteLoading}>{deleteLoading ? <Spinner size='sm' /> : 'Delete'}</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default PostureAnalyzer;