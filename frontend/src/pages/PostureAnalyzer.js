import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import { auth } from '../firebase';
import { Container, Card, Button, Spinner, Alert, Row, Col, ProgressBar, Badge, Form, Table, Modal } from 'react-bootstrap';

const PostureAnalyzer = () => {
  const navigate = useNavigate();
  const [postureScore, setPostureScore] = useState(null);
  const [annotatedImage, setAnnotatedImage] = useState(null);
  const [sessionScores, setSessionScores] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState('serverTimestamp');
  const [sortDir, setSortDir] = useState('desc');
  const [showLatestOnly, setShowLatestOnly] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState(null);
  const webcamRef = useRef(null);

  const sendFrameForAnalysis = async (imageSrc) => {
    if (!imageSrc) return;
    try {
      const response = await fetch('/api/posture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageSrc.split(',')[1] })
      });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const data = await response.json();
      if (data.posture_score !== undefined) {
        setPostureScore(data.posture_score);
        setSessionScores(prev => [...prev, data.posture_score]);
      }
      if (data.annotated_image) {
        setAnnotatedImage(`data:image/jpeg;base64,${data.annotated_image}`);
      }
    } catch (e) {
      console.error('Frame send error:', e);
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    let id;
    if (isAnalyzing && webcamRef.current) {
      id = setInterval(() => {
        const shot = webcamRef.current?.getScreenshot();
        if (shot) sendFrameForAnalysis(shot);
      }, 1000);
    }
    return () => id && clearInterval(id);
  }, [isAnalyzing]);

  const toggleAnalysis = () => {
    setIsAnalyzing(prev => {
      const next = !prev;
      if (!next) { setAnnotatedImage(null); setPostureScore(null); }
      return next;
    });
  };

  const endSessionAndSave = async () => {
    setIsAnalyzing(false);
    try {
      if (!sessionScores.length) { alert('No session data to save.'); return; }
      const avg = sessionScores.reduce((s,v)=>s+v,0)/sessionScores.length;
      const user = auth.currentUser;
      if (!user) { alert('User not authenticated.'); return; }
      const payload = { userId: user.uid, sessionData: { type:'posture', averageScore: +avg.toFixed(2), totalAnalyses: sessionScores.length, timestamp: new Date().toISOString() } };
      const resp = await fetch('/api/posture/save-session', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (!resp.ok) throw new Error('Save failed');
      alert('Session saved successfully!');
      // Refresh history immediately after successful save
      fetchHistory();
      setSessionScores([]); setPostureScore(null); setAnnotatedImage(null);
    } catch (e) {
      console.error(e); alert('Failed to save session.');
    }
  };

  const scoreVariant = (s) => s >= 80 ? 'success' : s >= 60 ? 'warning' : 'danger';

  // Fetch posture history
  const fetchHistory = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setHistoryLoading(true);
    try {
      const resp = await fetch(`/api/posture/history?userId=${user.uid}`);
      if (!resp.ok) throw new Error('History fetch failed');
      const data = await resp.json();
      setHistory(data.data || []);
    } catch (e) {
      console.error('History load error', e);
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => { fetchHistory(); }, []);

  const filteredHistory = history
    .filter(item => {
      if (!searchTerm) return true;
      const t = searchTerm.toLowerCase();
      return (
        (item.averageScore + '').includes(t) ||
        (item.serverTimestamp || '').toLowerCase().includes(t)
      );
    })
    .sort((a,b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const av = a[sortKey] || '';
      const bv = b[sortKey] || '';
      return av > bv ? dir : av < bv ? -dir : 0;
    });

  const displayedHistory = showLatestOnly ? filteredHistory.slice(0,1) : filteredHistory;

  const handleDeleteClick = (entry) => {
    setSessionToDelete(entry);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!sessionToDelete) return;
    setDeleteLoading(sessionToDelete.id);
    try {
      const resp = await fetch(`/api/posture/history/${sessionToDelete.id}`, { method:'DELETE' });
      if (!resp.ok) throw new Error('Delete failed');
      setHistory(prev => prev.filter(h => h.id !== sessionToDelete.id));
      setShowDeleteModal(false);
      setSessionToDelete(null);
    } catch (e) {
      alert('Failed to delete session');
    } finally {
      setDeleteLoading(null);
    }
  };

  return (
    <Container className='py-5'>
      <div className='text-center mb-4'>
        <h1 className='display-5'>Posture Analyzer</h1>
        <p className='text-muted lead mb-0'>Real-time posture feedback during practice.</p>
      </div>
      <Button variant='outline-primary' className='mb-4' onClick={()=>navigate('/dashboard')}>Back to Dashboard</Button>

      {/* Main analysis card */}
      <Card className='mb-4 shadow'>
        <Card.Body>
          <Card.Title as='h3' className='mb-4'>Live Posture Session</Card.Title>
          <Row>
            <Col lg={6} className='mb-4 mb-lg-0'>
              <Card className='h-100'>
                <Card.Body className='d-flex flex-column'>
                  <Card.Title as='h3' className='h5'>Live Camera Feed</Card.Title>
                  <div className='position-relative flex-grow-1 d-flex align-items-center justify-content-center bg-dark rounded mb-3'>
                    {isAnalyzing ? (
                      <Webcam ref={webcamRef} audio={false} screenshotFormat='image/jpeg' videoConstraints={{width:640,height:480,facingMode:'user'}} className='w-100 h-auto rounded'/>
                    ) : (
                      <div className='text-center text-white-50'><p className='mb-0'>Click "Start Analysis" to begin</p></div>
                    )}
                    {isAnalyzing && (
                      <div className='position-absolute top-0 start-0 m-2'>
                        <Badge bg='danger' className='d-flex align-items-center'>
                          <Spinner as='span' animation='grow' size='sm' className='me-1'/>
                          LIVE
                        </Badge>
                      </div>
                    )}
                  </div>
                  <div className='d-flex justify-content-center gap-2'>
                    <Button variant={isAnalyzing?'danger':'primary'} onClick={toggleAnalysis} className='px-4'>
                      {isAnalyzing? 'Stop Analysis':'Start Analysis'}
                    </Button>
                    {sessionScores.length>0 && !isAnalyzing && (
                      <Button variant='success' onClick={endSessionAndSave}>End Session & Save</Button>
                    )}
                  </div>
                  {isAnalyzing && (
                    <Alert variant='info' className='mt-3 text-center py-2 mb-0'>
                      <Spinner animation='border' size='sm' className='me-2'/>Analyzing posture...
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
                    {postureScore !== null && isAnalyzing ? (
                      <div>
                        <div className={`text-center fs-4 fw-bold mb-2 text-${scoreVariant(postureScore)}`}>{postureScore.toFixed(2)} / 100</div>
                        <ProgressBar now={postureScore} variant={scoreVariant(postureScore)} animated/>
                      </div>
                    ) : (
                      <Alert variant='secondary' className='text-center py-2 mb-0'>{isAnalyzing ? 'Acquiring score...' : 'Start analysis to see live score'}</Alert>
                    )}
                  </div>
                  <div className='mb-4'>
                    <h6 className='fw-semibold mb-2'>Live Annotated Image</h6>
                    {annotatedImage && isAnalyzing ? (
                      <Card.Img src={annotatedImage} alt='Live Posture Analysis' className='rounded border'/>
                    ) : (
                      <div className='d-flex align-items-center justify-content-center bg-light rounded border flex-grow-1' style={{minHeight:'200px'}}>
                        <p className='text-muted m-0'>{isAnalyzing ? 'Waiting for analysis...' : 'Annotated image will appear here'}</p>
                      </div>
                    )}
                  </div>
                  {sessionScores.length>0 && (
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
                    </div>
                  )}
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Posture Tips (UPDATED UI) */}
      <Card className='mb-4 shadow'>
        <Card.Body>
          <Card.Title as='h3' className='mb-3'>🧘 Posture Tips</Card.Title>
          <Row>
            <Col md={4} className='mb-3'>
              <Alert variant='success' className='mb-0'>
                <strong>Sit Up Straight:</strong> Keep your back straight and shoulders relaxed.
              </Alert>
            </Col>
            <Col md={4} className='mb-3'>
              <Alert variant='info' className='mb-0'>
                <strong>Eye Level:</strong> Position your camera at eye level to prevent head tilt.
              </Alert>
            </Col>
            <Col md={4} className='mb-3'>
              <Alert variant='warning' className='mb-0'>
                <strong>Shoulders Back:</strong> Consciously avoid slouching forward during the interview.
              </Alert>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* History Card */}
      <Card className='mb-4 shadow'>
        <Card.Body>
          <Card.Title as='h3' className='mb-3'>History</Card.Title>
          {/* Advanced Controls */}
          <div className="d-flex flex-wrap gap-3 mb-3 align-items-center">
            <Form.Control
              type="text"
              placeholder="Search by score or date..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ maxWidth: 280 }}
            />
            <Form.Select
              value={sortKey}
              onChange={e => setSortKey(e.target.value)}
              style={{ maxWidth: 160 }}
            >
              <option value="serverTimestamp">Sort by Date</option>
              <option value="averageScore">Sort by Avg Score</option>
              <option value="totalAnalyses">Sort by Analyses</option>
            </Form.Select>
            <Form.Select
              value={sortDir}
              onChange={e => setSortDir(e.target.value)}
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
            <Button variant="outline-secondary" onClick={() => {
              if (!displayedHistory.length) return;
              const headers = ['Date','Avg Score','Analyses'];
              const rows = displayedHistory.map(h => [h.serverTimestamp, h.averageScore, h.totalAnalyses]);
              const csv = [headers.join(','), ...rows.map(r=>r.join(','))].join('\n');
              const blob = new Blob([csv], {type:'text/csv'});
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'posture_history.csv'; a.click();
              URL.revokeObjectURL(url);
            }}>Export</Button>
          </div>
          <Table striped bordered responsive className='mb-0'>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Avg Score</th>
                  <th>Analyses</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  <tr>
                    <td colSpan={4} className='text-center'>
                      <Spinner animation='border' size='sm' className='me-2' /> Loading...
                    </td>
                  </tr>
                ) : displayedHistory.length ? (
                  displayedHistory.map(h => (
                    <tr key={h.id}>
                      <td>{h.serverTimestamp ? new Date(h.serverTimestamp).toLocaleString() : 'N/A'}</td>
                      <td>{h.averageScore}%</td>
                      <td>{h.totalAnalyses}</td>
                      <td>
                        <Button 
                          size='sm' 
                          variant='outline-danger'
                          onClick={() => handleDeleteClick(h)}
                          disabled={deleteLoading === h.id}
                        >
                          {deleteLoading === h.id ? <Spinner size='sm' animation='border' /> : 'Delete'}
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className='text-center text-muted'>
                      No posture history yet. Start your first session above!
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
        </Card.Body>
      </Card>

      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Delete Posture Session</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete this posture session? This action cannot be undone.
        </Modal.Body>
        <Modal.Footer>
          <Button variant='secondary' onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button variant='danger' onClick={confirmDelete} disabled={!!deleteLoading}>
            {deleteLoading ? <Spinner size='sm' /> : 'Delete'}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default PostureAnalyzer;