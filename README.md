# 🚀 AI-Powered Interview Preparation App

A comprehensive interview preparation platform that leverages artificial intelligence to help users improve their interview skills through resume analysis, posture training, dressing sense guidance, and AI-driven mock interviews.

## ✨ Features

### 🎯 Core Functionality
- **Resume Analysis**: AI-powered resume review with optimization suggestions
- **Posture Training**: Real-time posture correction and body language tips
- **Dressing Sense**: Professional attire recommendations and style guidance
- **Mock Interviews**: AI-driven interview simulations with personalized feedback

### 🔧 Technical Features
- **Modern UI/UX**: Beautiful, responsive design built with React and Tailwind CSS
- **Real-time Processing**: Instant feedback and analysis results
- **Secure Authentication**: Firebase-based user management
- **RESTful API**: Scalable backend architecture with Express.js
- **Cloud Integration**: Firebase services for data storage and authentication

## 🛠️ Tech Stack

### Frontend
- **React 18** - Modern React with hooks and functional components
- **Tailwind CSS** - Utility-first CSS framework for rapid UI development
- **React Router** - Client-side routing for single-page application
- **Firebase** - Authentication, Firestore database, and cloud storage

### Backend
- **Node.js** - JavaScript runtime environment
- **Express.js** - Fast, unopinionated web framework
- **Firebase Admin SDK** - Server-side Firebase integration
- **CORS** - Cross-origin resource sharing support
- **dotenv** - Environment variable management

### Development Tools
- **PostCSS** - CSS processing with Tailwind CSS
- **Autoprefixer** - Automatic vendor prefixing
- **Nodemon** - Development server with auto-restart

## 📁 Project Structure

```
interview-prep-ai/
├── frontend/                 # React frontend application
│   ├── public/              # Static assets
│   ├── src/                 # Source code
│   │   ├── pages/          # Page components
│   │   │   ├── LandingPage.js
│   │   │   ├── AuthPage.js
│   │   │   └── Dashboard.js
│   │   ├── App.js          # Main app component
│   │   ├── index.js        # Entry point
│   │   ├── index.css       # Global styles with Tailwind
│   │   └── firebaseConfig.js # Firebase configuration
│   ├── package.json        # Frontend dependencies
│   ├── tailwind.config.js  # Tailwind CSS configuration
│   └── postcss.config.js   # PostCSS configuration
├── backend/                 # Node.js backend API
│   ├── server.js           # Express server and routes
│   └── package.json        # Backend dependencies
├── firebase.json           # Firebase project configuration
├── firestore.rules         # Firestore security rules
├── firestore.indexes.json  # Firestore indexes
├── storage.rules           # Firebase storage rules
└── README.md               # Project documentation
```

## 🚀 Quick Start

### Prerequisites
- **Node.js** (v16 or higher)
- **npm** or **yarn**
- **Firebase project** (for authentication and database)

### 1. Clone the Repository
```bash
git clone <your-repository-url>
cd interview-prep-ai
```

### 2. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Create environment variables file
# Copy the example below and fill in your Firebase config
echo "REACT_APP_FIREBASE_API_KEY=your_api_key_here
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=123456789
REACT_APP_FIREBASE_APP_ID=your_app_id
REACT_APP_BACKEND_URL=http://localhost:5000" > .env.local

# Start development server
npm start
```

The frontend will be available at `http://localhost:3000`

### 3. Backend Setup
```bash
cd backend

# Install dependencies
npm install

# Create environment variables file
# Copy the example below and fill in your Firebase Admin SDK config
echo "PORT=5000
NODE_ENV=development
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY_ID=your_private_key_id
FIREBASE_PRIVATE_KEY=\"-----BEGIN PRIVATE KEY-----\\nYour private key here\\n-----END PRIVATE KEY-----\\n\"
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_CLIENT_ID=your_client_id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=your_cert_url" > .env

# Start development server
npm run dev
```

The backend API will be available at `http://localhost:5000`

## 🔥 Firebase Setup

### 1. Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" and follow the setup wizard
3. Enable Authentication, Firestore Database, and Storage

### 2. Configure Authentication
1. In Firebase Console, go to Authentication > Sign-in method
2. Enable Email/Password and Google sign-in methods
3. Add your authorized domains

### 3. Get Configuration
1. Go to Project Settings > General
2. Scroll down to "Your apps" section
3. Click the web app icon (</>) to add a web app
4. Copy the configuration object for frontend

### 4. Setup Admin SDK
1. Go to Project Settings > Service Accounts
2. Click "Generate new private key"
3. Download the JSON file
4. Use the values in your backend `.env` file

### 5. Update Security Rules
1. **Firestore Rules**: Update `firestore.rules` with your security requirements
2. **Storage Rules**: Update `storage.rules` for file upload permissions

## 📱 Available Routes

### Frontend Routes
- `/` - Landing page with feature overview
- `/auth` - Login/Signup page
- `/dashboard` - Main application dashboard

### Backend API Endpoints
- `GET /` - Health check and API info
- `POST /uploadResume` - Upload and analyze resume
- `GET /questions` - Fetch interview questions
- `POST /answers` - Submit interview answers for analysis
- `GET /feedback/:userId` - Get user feedback history

## 🎨 Customization

### Styling
- Modify `frontend/src/index.css` for global styles
- Update `frontend/tailwind.config.js` for theme customization
- Component-specific styles can be added inline or in separate CSS modules

### Features
- Add new pages in `frontend/src/pages/`
- Extend backend routes in `backend/server.js`
- Integrate additional AI services for enhanced functionality

## 🚀 Deployment

### Frontend (Vercel/Netlify)
```bash
cd frontend
npm run build
# Deploy the build folder to your hosting platform
```

### Backend (Heroku/Railway)
```bash
cd backend
# Set environment variables in your hosting platform
# Deploy using git push or platform-specific commands
```

### Environment Variables
Make sure to set all required environment variables in your production environment:
- Frontend: All `REACT_APP_*` variables
- Backend: All Firebase Admin SDK credentials

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 TODO

- [ ] Implement actual AI analysis for resume parsing
- [ ] Add real-time posture detection using computer vision
- [ ] Integrate with AI services for interview question generation
- [ ] Add user progress tracking and analytics
- [ ] Implement video recording for mock interviews
- [ ] Add multi-language support
- [ ] Create admin dashboard for content management
- [ ] Add unit and integration tests
- [ ] Implement CI/CD pipeline

## 🐛 Troubleshooting

### Common Issues

**Frontend won't start:**
- Check if all dependencies are installed: `npm install`
- Verify Node.js version (v16+ required)
- Check for syntax errors in console

**Backend connection failed:**
- Ensure backend is running on port 5000
- Check CORS configuration
- Verify environment variables are set correctly

**Firebase authentication issues:**
- Verify Firebase configuration in `.env.local`
- Check Firebase Console for authentication settings
- Ensure authorized domains are configured

**Tailwind CSS not working:**
- Run `npx tailwindcss init -p` to regenerate config files
- Check if PostCSS is properly configured
- Verify content paths in `tailwind.config.js`

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Your Name** - Final Year B.Tech Project

## 🙏 Acknowledgments

- React team for the amazing framework
- Tailwind CSS for the utility-first approach
- Firebase for the comprehensive backend services
- Express.js community for the robust web framework

---

**Happy Coding! 🎉**

For support or questions, please open an issue in the repository. 