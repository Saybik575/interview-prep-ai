import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MockInterviewPage from './pages/MockInterviewPage';
import ResumeAnalysisPage from './pages/ResumeAnalysisPage';
import InterviewHistoryPage from './pages/InterviewHistoryPage';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from './firebase';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import 'bootstrap/dist/css/bootstrap.min.css';

const PrivateRoute = ({ children }) => {
  const [user, loading] = useAuthState(auth);
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }
  return user ? children : <Navigate to="/auth" replace />;
};

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          />
          <Route path="/resume-analysis" element={<ResumeAnalysisPage />} />
          <Route path="/mock-interview" element={<MockInterviewPage />} />
          <Route path="/interview-history" element={<InterviewHistoryPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
