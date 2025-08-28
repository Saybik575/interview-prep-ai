import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';

const getInitials = (nameOrEmail = '') => {
  const base = nameOrEmail.split('@')[0];
  const parts = base.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const Dashboard = () => {
  const navigate = useNavigate();
  const auth = getAuth();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        navigate('/auth');
      } else {
        // Force refresh to get correct photoURL from Google
        await u.reload();
        setUser(auth.currentUser);
      }
    });
    return () => unsub();
  }, [auth, navigate]);

  const features = [
    {
      id: 'resume-analysis',
      title: 'Resume Analysis',
      description: 'Upload your resume and get AI-powered feedback and optimization suggestions',
      color: 'blue',
      action: 'Analyze Resume',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      id: 'posture-training',
      title: 'Posture Training',
      description: 'Real-time posture correction and body language improvement tips',
      color: 'green',
      action: 'Start Training',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
    {
      id: 'dressing-sense',
      title: 'Dressing Sense',
      description: 'Get professional attire recommendations and style guidance',
      color: 'purple',
      action: 'Get Style Tips',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z" />
        </svg>
      ),
    },
    {
      id: 'mock-interview',
      title: 'Mock Interview',
      description: 'Practice with AI-driven interview simulations and get feedback',
      color: 'orange',
      action: 'Start Interview',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    },
  ];

  const getColorClasses = (color) => {
    const colorMap = {
      blue: 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100',
      green: 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100',
      purple: 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100',
      orange: 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100',
    };
    return colorMap[color] || colorMap.blue;
  };

  const handleFeatureClick = (featureId) => {
    console.log(`Feature clicked: ${featureId}`);
    alert(`${features.find(f => f.id === featureId)?.title} feature coming soon!`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-900">Interview Prep Dashboard</h1>
            <div className="flex items-center space-x-4">
              {user && (
                <span className="text-gray-600">Welcome, {user.displayName || user.email}!</span>
              )}
              <button
                onClick={async () => { await signOut(auth); navigate('/auth'); }}
                className="text-gray-500 hover:text-gray-700 text-sm font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {user && (
          <div className="mb-8 bg-white rounded-xl shadow-md border border-gray-200 p-6 flex items-center">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'Profile'}
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-full shadow-lg object-cover mr-4"
              />
            ) : (
              <div className="w-16 h-16 rounded-full shadow-lg bg-gray-200 text-gray-700 flex items-center justify-center font-semibold mr-4">
                {getInitials(user.displayName || user.email)}
              </div>
            )}
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">
                Welcome, {user.displayName || 'User'} 👋
              </h2>
              <p className="text-gray-600">{user.email}</p>
            </div>
          </div>
        )}

        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Ready to ace your interview?
          </h2>
          <p className="text-lg text-gray-600">
            Choose from our AI-powered tools to improve your interview skills
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
          {features.map((feature) => (
            <div
              key={feature.id}
              className="bg-white rounded-lg shadow-md border border-gray-200 p-6 hover:shadow-lg transition-shadow duration-300"
            >
              <div className="flex items-start space-x-4">
                <div className={`p-3 rounded-lg border ${getColorClasses(feature.color)}`}>
                  {feature.icon}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600 mb-4 leading-relaxed">
                    {feature.description}
                  </p>
                  <button
                    onClick={() => handleFeatureClick(feature.id)}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-gray-800 hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-700 transition duration-300"
                  >
                    {feature.action}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Progress</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">0</div>
              <div className="text-sm text-gray-600">Resumes Analyzed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">0</div>
              <div className="text-sm text-gray-600">Training Sessions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">0</div>
              <div className="text-sm text-gray-600">Style Tips</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">0</div>
              <div className="text-sm text-gray-600">Mock Interviews</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;