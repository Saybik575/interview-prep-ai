import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, googleProvider } from '../firebase';
import { signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { FcGoogle } from 'react-icons/fc';
import { Container, Card, Form, Button, Spinner } from 'react-bootstrap';

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleGoogle = async () => {
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
      navigate('/dashboard');
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match');
        }
        await createUserWithEmailAndPassword(auth, email, password);
      }
      navigate('/dashboard');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-vh-100 bg-white d-flex justify-content-center align-items-center">
      <Container>
        <Card className="shadow-lg mx-auto" style={{ maxWidth: 400 }}>
          <Card.Header className="bg-white text-center border-0 pt-4 pb-2">
            <h2 className="fw-bold mb-1">{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
            <div className="text-muted mb-2">
              {isLogin ? 'Sign in to continue' : 'Sign up to get started'}
            </div>
          </Card.Header>
          <Card.Body className="px-4 pb-4">
            {error && (
              <div className="mb-3 text-danger text-center small">
                {error}
              </div>
            )}
            <Form onSubmit={handleSubmit} autoComplete="off">
              <Form.Group className="mb-3" controlId="formEmail">
                <Form.Label>Email</Form.Label>
                <Form.Control
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                />
              </Form.Group>
              <Form.Group className="mb-3" controlId="formPassword">
                <Form.Label>Password</Form.Label>
                <Form.Control
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                />
              </Form.Group>
              {!isLogin && (
                <Form.Group className="mb-3" controlId="formConfirmPassword">
                  <Form.Label>Confirm Password</Form.Label>
                  <Form.Control
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                  />
                </Form.Group>
              )}
              <Button
                variant="primary"
                type="submit"
                className="w-100 fw-semibold"
                disabled={loading}
              >
                {loading ? <Spinner animation="border" size="sm" className="me-2" /> : null}
                {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Sign Up'}
              </Button>
            </Form>
            <div className="d-flex align-items-center my-4">
              <div className="flex-grow-1 border-bottom" />
              <span className="px-2 text-muted small">Or</span>
              <div className="flex-grow-1 border-bottom" />
            </div>
            <Button
              variant="outline-secondary"
              className="w-100 d-flex align-items-center justify-content-center mb-2"
              onClick={handleGoogle}
            >
              <FcGoogle size={22} className="me-2" />
              Sign in with Google
            </Button>
            <div className="text-center mt-3">
              <Button
                variant="link"
                className="p-0 text-primary"
                onClick={() => setIsLogin(!isLogin)}
              >
                {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
              </Button>
            </div>
          </Card.Body>
        </Card>
      </Container>
    </div>
  );
};

export default AuthPage; 