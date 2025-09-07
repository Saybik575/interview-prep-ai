import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Row, Col, Card, Button } from 'react-bootstrap';
import { FaFileAlt, FaMicrophoneAlt, FaTshirt, FaUser } from 'react-icons/fa';

const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-vh-100 bg-white d-flex flex-column justify-content-center align-items-center position-relative">
      {/* Brand Title in Top Left Corner */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 30,
          zIndex: 10,
          fontFamily: 'Montserrat, Poppins, sans-serif',
          fontWeight: 700,
          fontSize: '2.5rem',
          color: '#222',
          letterSpacing: '1px',
          textShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        Interview Prep AI
      </div>

      {/* Main Content Container */}
  <Container style={{ marginTop: '100px', marginBottom: '35px' }}>
        {/* Hero Section Card */}
        <Row className="justify-content-center mb-5">
          <Col xs={12} md={8} lg={6}>
            <Card className="shadow-lg border-0">
              <Card.Body className="text-center py-5">
                <Card.Title className="mb-4 display-5 fw-bold text-dark">
                  Ace Your Job Preparation with AI
                </Card.Title>
                <Card.Text className="mb-4 text-secondary fs-5">
                  Unlock your career potential with AI-powered resume analysis, interview practice, and instant feedback. Get personalized insights and prepare to stand out in every job application.
                </Card.Text>
                <Button
                  variant="primary"
                  size="lg"
                  className="fw-bold shadow-sm px-5"
                  onClick={() => navigate('/auth')}
                >
                  Get Started
                </Button>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* Feature Cards Grid */}
  <Row className="g-10 justify-content-center"> {/* Increased vertical gap with g-10 */}
          <Col xs={12} md={6} lg={3}>
            <Card className="h-100 shadow-sm border-0">
              <Card.Body className="text-center py-4">
                <Card.Title className="mb-3 d-flex flex-column align-items-center text-primary">
                  <FaFileAlt size={32} className="mb-2" />
                  Resume Analysis
                </Card.Title>
                <Card.Text className="text-secondary">
                  AI-powered resume review and optimization suggestions.
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
          <Col xs={12} md={6} lg={3}>
            <Card className="h-100 shadow-sm border-0">
              <Card.Body className="text-center py-4">
                <Card.Title className="mb-3 d-flex flex-column align-items-center text-success">
                  <FaMicrophoneAlt size={32} className="mb-2" />
                  Interview Practice
                </Card.Title>
                <Card.Text className="text-secondary">
                  Practice common interview questions and get instant feedback.
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
          <Col xs={12} md={6} lg={3}>
            <Card className="h-100 shadow-sm border-0">
              <Card.Body className="text-center py-4">
                <Card.Title className="mb-3 d-flex flex-column align-items-center text-danger">
                  <FaUser size={32} className="mb-2" />
                  Posture Training
                </Card.Title>
                <Card.Text className="text-secondary">
                  Real-time posture correction and body language improvement tips.
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
          <Col xs={12} md={6} lg={3}>
            <Card className="h-100 shadow-sm border-0">
              <Card.Body className="text-center py-4">
                <Card.Title className="mb-3 d-flex flex-column align-items-center text-warning">
                  <FaTshirt size={32} className="mb-2" />
                  Dressing Sense
                </Card.Title>
                <Card.Text className="text-secondary">
                  Get professional attire recommendations and style guidance.
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
      
  {/* Footer Card at the bottom */}
      <footer className="mt-auto py-3 w-100">
        <Container fluid>
          <Row>
            <Col xs={12}>
              <Card className="shadow-sm border-0">
                <Card.Body className="text-center py-3">
                  <span className="text-secondary fw-semibold">© {new Date().getFullYear()} Interview Prep AI. All rights reserved.</span>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Container>
      </footer>
    </div>
  );
};

export default LandingPage;