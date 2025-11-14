import React from 'react';
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
} from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from './firebase';
import 'bootstrap/dist/css/bootstrap.min.css';

// Lazy-loaded route components (code splitting)
const LandingPage = React.lazy(() => import('./pages/LandingPage'));
const AuthPage = React.lazy(() => import('./pages/AuthPage'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const ResumeAnalysisPage = React.lazy(() => import('./pages/ResumeAnalysisPage'));
const MockInterviewPage = React.lazy(() => import('./pages/MockInterviewPage'));
const PostureAnalyzer = React.lazy(() => import('./pages/PostureAnalyzer'));

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-gray-600">Loading...</div>
  </div>
);

const PrivateWrapper = ({ element }) => {
  const [user, loading] = useAuthState(auth);
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/auth" replace />;
  return element;
};

// Central route config using Data APIs with future flags (silences v7 warnings)
export const router = createBrowserRouter(
  [
    { path: '/', element: <LandingPage /> },
    { path: '/auth', element: <AuthPage /> },
    { path: '/dashboard', element: <PrivateWrapper element={<Dashboard />} /> },
    { path: '/resume-analysis', element: <ResumeAnalysisPage /> },
    { path: '/mock-interview', element: <MockInterviewPage /> },
    { path: '/posture-analyzer', element: <PostureAnalyzer /> },
    { path: '*', element: <Navigate to="/" replace /> },
  ],
  {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    },
  }
);

export default function App() {
  return (
    <React.Suspense fallback={<div style={{padding:'2rem', textAlign:'center'}}>Loading...</div>}>
      <RouterProvider router={router} />
    </React.Suspense>
  );
}
