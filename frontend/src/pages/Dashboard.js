import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { Container, Row, Col, Card, Button } from 'react-bootstrap';
import { FaFileAlt, FaMicrophone, FaUserCheck, FaTshirt } from 'react-icons/fa';

const Dashboard = () => {
  const navigate = useNavigate();
  const auth = getAuth();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        navigate('/auth');
      } else {
        await u.reload();
        setUser(auth.currentUser);
      }
    });
    return () => unsub();
  }, [auth, navigate]);

  return (
    <Container className="py-5">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="fw-bold">Interview Prep Dashboard</h1>
        <div>
          {user && (
            <span className="me-3 text-secondary">
              Welcome, {user.displayName || user.email}!
            </span>
          )}
          <Button variant="outline-secondary" size="sm" onClick={async () => { await signOut(auth); navigate('/'); }}>Logout</Button>
        </div>
      </div>

      {user && (
        <Card className="mb-4 shadow-sm">
          <Card.Body className="d-flex align-items-center">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'Profile'}
                referrerPolicy="no-referrer"
                className="rounded-circle shadow me-3"
                style={{ width: 64, height: 64, objectFit: 'cover' }}
              />
            ) : (
              <div className="rounded-circle bg-light text-secondary d-flex align-items-center justify-content-center fw-bold me-3" style={{ width: 64, height: 64, fontSize: 24 }}>
                {(user.displayName || user.email || 'U').slice(0,2).toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="h4 fw-bold mb-1">Welcome, {user.displayName || 'User'} 👋</h2>
              <div className="text-muted">{user.email}</div>
            </div>
          </Card.Body>
        </Card>
      )}

      <div className="mb-4">
        <h2 className="fw-bold mb-2">Ready to ace your interview?</h2>
        <div className="text-secondary">Choose from our AI-powered tools to improve your interview skills</div>
      </div>

      <Row className="g-4 mb-5 justify-content-center">
        {/* ...existing feature cards... */}
        <Col md={6} className="d-flex">
          <Card className="shadow-sm h-100 flex-fill">
            <Card.Header className="d-flex align-items-center bg-primary text-white">
              <FaFileAlt className="me-2" size={24} />
              <span className="fw-bold">Analyze Resume</span>
            </Card.Header>
            <Card.Body>
              <Card.Text>
                Upload your resume and get AI-powered feedback and optimization suggestions.
              </Card.Text>
              <Button variant="primary" onClick={() => navigate('/resume-analysis')}>
                Go to Resume Analysis
              </Button>
            </Card.Body>
          </Card>
        </Col>
        <Col md={6} className="d-flex">
          <Card className="shadow-sm h-100 flex-fill">
            <Card.Header className="d-flex align-items-center bg-success text-white">
              <FaMicrophone className="me-2" size={24} />
              <span className="fw-bold">Practice Interview</span>
            </Card.Header>
            <Card.Body>
              <Card.Text>
                Practice with AI-driven interview simulations and get instant feedback.
              </Card.Text>
              <Button variant="success" onClick={() => navigate('/mock-interview')}>
                Go to Practice Interview
              </Button>
            </Card.Body>
          </Card>
        </Col>
        <Col md={6} className="d-flex">
          <Card className="shadow-sm h-100 flex-fill">
            <Card.Header className="d-flex align-items-center bg-danger text-white">
              <FaUserCheck className="me-2" size={24} />
              <span className="fw-bold">Posture Training</span>
            </Card.Header>
            <Card.Body>
              <Card.Text>
                Real-time posture correction and body language improvement tips.
              </Card.Text>
              <Button variant="danger" onClick={() => navigate('/posture-analyzer')}>
                Start Training
              </Button>
            </Card.Body>
          </Card>
        </Col>
        <Col md={6} className="d-flex">
          <Card className="shadow-sm h-100 flex-fill">
            <Card.Header className="d-flex align-items-center bg-warning text-white">
              <FaTshirt className="me-2" size={24} />
              <span className="fw-bold">Dressing Sense</span>
            </Card.Header>
            <Card.Body>
              <Card.Text>
                Get professional attire recommendations and style guidance.
              </Card.Text>
              <Button variant="warning" onClick={() => alert('Feature coming soon!')}>
                Get Style Tips
              </Button>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Footer Card */}
      <Row className="justify-content-center mt-4">
        <Col xs={12}>
          <Card className="shadow-lg border-0" style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', borderRadius: '1rem' }}>
            <Card.Body className="text-center py-3">
              <div className="fw-bold text-white" style={{ fontSize: '1.25rem' }}>Interview Prep AI</div>
              <div className="text-white-50" style={{ fontSize: '1rem' }}>© 2024 Interview Prep AI. All Rights Reserved.</div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default Dashboard;
