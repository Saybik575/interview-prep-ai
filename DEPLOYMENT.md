# 🚀 Deployment Guide - Interview Prep AI

This guide will help you deploy your AI Interview Preparation App to the cloud **for FREE** using Render.com.

---

## 📋 Prerequisites

Before deploying, ensure you have:

- ✅ GitHub account (to push your code)
- ✅ Render.com account (free signup at https://render.com)
- ✅ Firebase project setup (for authentication & database)
- ✅ Google Gemini API key (for mock interview service)

---

## 🏗️ Architecture Overview

Your app will be deployed as 5 separate microservices:

```
┌─────────────────────────────────────────────────────┐
│  Frontend (React)                                   │
│  Deployed on: Vercel/Netlify/Render                │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│  Backend API (Node.js)                              │
│  Port: 5000 | Handles routing & Firebase           │
└─────────────────────────────────────────────────────┘
          │         │         │         │
          ▼         ▼         ▼         ▼
    ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
    │Posture  │ │Dressing │ │Resume   │ │Mock     │
    │Analysis │ │Analysis │ │Analysis │ │Interview│
    │(Python) │ │(Python) │ │(Python) │ │(Python) │
    │Port:5001│ │Port:5002│ │Port:5003│ │Port:5004│
    └─────────┘ └─────────┘ └─────────┘ └─────────┘
```

---

## 📦 Step 1: Prepare Your Repository

### 1.1 Push Code to GitHub

```bash
# Initialize git (if not already done)
cd d:\Satvik\IPD\interview-prep-ai
git init

# Add all files
git add .

# Commit
git commit -m "Add Docker deployment configuration"

# Create GitHub repository and push
git remote add origin https://github.com/YOUR_USERNAME/interview-prep-ai.git
git branch -M main
git push -u origin main
```

### 1.2 Verify Files

Make sure these files exist in your repository:
- ✅ `render.yaml` (root directory)
- ✅ `backend/Dockerfile`
- ✅ `backend/posture-analysis-service/Dockerfile`
- ✅ `backend/dressing-analysis-service/Dockerfile`
- ✅ `backend/resume-analysis-service/Dockerfile`
- ✅ `backend/mock-interview-service/Dockerfile`
- ✅ All `requirements.txt` files in Python services

---

## 🎯 Step 2: Deploy Backend Services to Render

### 2.1 Sign Up for Render

1. Go to https://render.com
2. Click "Get Started for Free"
3. Sign up with GitHub (recommended)
4. Authorize Render to access your repositories

### 2.2 Create Blueprint (Recommended Method)

This deploys all 5 services at once using `render.yaml`:

1. **Dashboard** → Click "New" → Select "Blueprint"
2. **Connect Repository**: Select `interview-prep-ai`
3. **Blueprint Name**: `interview-prep-ai-services`
4. **Apply Blueprint** → Render will auto-detect `render.yaml`
5. **Configure Environment Variables** (see section 2.3)
6. Click "Apply" → Wait 10-15 minutes for all services to build

### 2.3 Configure Environment Variables

For each service, add these environment variables in Render dashboard:

#### **Backend API (Node.js)**
```
NODE_ENV=production
PORT=5000
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key (from Firebase Admin SDK)
FIREBASE_CLIENT_EMAIL=your-client-email
```

**Note**: Service URLs (`POSTURE_SERVICE_URL`, etc.) are auto-configured by `render.yaml`

#### **Resume Analysis Service**
```
FLASK_ENV=production
PORT=5003
GOOGLE_APPLICATION_CREDENTIALS=/app/firebase-key.json (if needed)
```

#### **Mock Interview Service**
```
FLASK_ENV=production
PORT=5004
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL_NAME=gemini-2.5-flash
```

#### **Posture & Dressing Services**
```
FLASK_ENV=production
PORT=5001 (or 5002 for dressing)
```

### 2.4 Alternative: Manual Service Creation

If you prefer to deploy services one by one:

#### Deploy Node.js Backend:
1. Dashboard → "New" → "Web Service"
2. Connect repository: `interview-prep-ai`
3. **Name**: `interview-prep-backend`
4. **Environment**: Node
5. **Build Command**: `cd backend && npm install`
6. **Start Command**: `cd backend && node server.js`
7. Add environment variables (from section 2.3)
8. Click "Create Web Service"

#### Deploy Python Services:
For each Python service (posture, dressing, resume, mock-interview):

1. Dashboard → "New" → "Web Service"
2. Connect repository: `interview-prep-ai`
3. **Name**: `posture-analysis-service` (or other service name)
4. **Environment**: Docker
5. **Dockerfile Path**: `./backend/posture-analysis-service/Dockerfile`
6. **Docker Context**: `./backend/posture-analysis-service`
7. Add environment variables
8. Click "Create Web Service"

Repeat for all 4 Python services.

---

## 🌐 Step 3: Deploy Frontend to Vercel (Recommended)

### 3.1 Files Already Configured ✅

Your frontend is ready to deploy with these pre-configured files:

- ✅ `frontend/vercel.json` - Handles SPA routing and API proxy
- ✅ `frontend/.env.example` - Template for environment variables
- ✅ All API calls use relative paths (`/api/...`) - automatically proxied

### 3.2 Get Your Firebase Configuration

1. Go to Firebase Console: https://console.firebase.google.com
2. Select your project: `interview-prep-ai-1fdc7`
3. Click ⚙️ Settings → Project Settings
4. Scroll to "Your apps" → Select Web App
5. Copy the configuration values

### 3.3 Deploy to Vercel (Step-by-Step)

#### **Option A: Using Vercel Dashboard (Easiest)**

1. **Sign Up**: Go to https://vercel.com → Sign up with GitHub
2. **New Project**: Click "Add New..." → "Project"
3. **Import Repository**: 
   - Click "Import Git Repository"
   - Select `interview-prep-ai` from your repositories
   - Click "Import"

4. **Configure Build Settings**:
   - **Framework Preset**: Create React App (auto-detected)
   - **Root Directory**: Click "Edit" → Enter `frontend`
   - **Build Command**: `npm run build` (auto-filled)
   - **Output Directory**: `build` (auto-filled)
   - **Install Command**: `npm install` (auto-filled)

5. **Add Environment Variables**:
   Click "Environment Variables" and add each one:
   
   ```
   Name: REACT_APP_FIREBASE_API_KEY
   Value: [paste from Firebase Console]
   
   Name: REACT_APP_FIREBASE_AUTH_DOMAIN
   Value: interview-prep-ai-1fdc7.firebaseapp.com
   
   Name: REACT_APP_FIREBASE_PROJECT_ID
   Value: interview-prep-ai-1fdc7
   
   Name: REACT_APP_FIREBASE_STORAGE_BUCKET
   Value: interview-prep-ai-1fdc7.firebasestorage.app
   
   Name: REACT_APP_FIREBASE_MESSAGING_SENDER_ID
   Value: [paste from Firebase Console]
   
   Name: REACT_APP_FIREBASE_APP_ID
   Value: [paste from Firebase Console]
   
   Name: REACT_APP_FIREBASE_MEASUREMENT_ID
   Value: [paste from Firebase Console]
   ```

6. **Deploy**: Click "Deploy" → Wait 2-3 minutes
7. **Success**: Your app will be live at `https://your-project.vercel.app`

#### **Option B: Using Vercel CLI (Advanced)**

```bash
# Install Vercel CLI globally
npm install -g vercel

# Navigate to project root
cd d:\Satvik\IPD\interview-prep-ai

# Login to Vercel
vercel login

# Deploy
vercel --prod

# Follow prompts:
# - Set up and deploy? Y
# - Which scope? [your account]
# - Link to existing project? N
# - Project name? interview-prep-ai
# - Directory? frontend
# - Override build settings? N
```

Then add environment variables via dashboard.

### 3.4 Alternative: Deploy Frontend to Netlify

1. Go to https://netlify.com → Sign up with GitHub
2. Click "Add new site" → "Import an existing project"
3. **Connect to Git**: GitHub → Select `interview-prep-ai`
4. **Build Settings**:
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `frontend/build`
5. **Environment Variables**: Site settings → Environment variables → Add each Firebase config variable
6. Click "Deploy site"

### 3.5 Alternative: Deploy Frontend to Render

1. Dashboard → "New" → "Static Site"
2. Connect repository: `interview-prep-ai`
3. **Name**: `interview-prep-frontend`
4. **Root Directory**: `frontend`
5. **Build Command**: `npm install && npm run build`
6. **Publish Directory**: `build`
7. Add environment variables (same Firebase config as above)
8. Click "Create Static Site"

---

## 🔧 Step 4: Configure CORS and Service URLs

### 4.1 Update Backend CORS Settings

In `backend/server.js`, update CORS to allow your frontend domain:

```javascript
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://your-frontend.vercel.app',
    'https://interview-prep-frontend.onrender.com'
  ],
  credentials: true
}));
```

### 4.2 Update Service URLs in Backend

Render automatically provides service URLs. Update environment variables:

```
POSTURE_SERVICE_URL=https://posture-analysis-service.onrender.com
DRESSING_SERVICE_URL=https://dressing-analysis-service.onrender.com
RESUME_SERVICE_URL=https://resume-analysis-service.onrender.com
MOCK_INTERVIEW_SERVICE_URL=https://mock-interview-service.onrender.com
```

Or use the auto-configuration from `render.yaml` (recommended).

---

## 🎨 Step 5: Test Your Deployment

### 5.1 Check Service Health

Visit each service URL in your browser:

- Backend API: `https://interview-prep-backend.onrender.com/api/health`
- Posture: `https://posture-analysis-service.onrender.com/api/health`
- Dressing: `https://dressing-analysis-service.onrender.com/api/health`
- Resume: `https://resume-analysis-service.onrender.com/api/health`
- Mock Interview: `https://mock-interview-service.onrender.com/api/health`

### 5.2 Test Frontend

1. Visit your frontend URL: `https://your-frontend.vercel.app`
2. Try user authentication
3. Upload a resume
4. Test posture analysis
5. Test mock interview

---

## ⚠️ Important Notes About Free Tier

### Render Free Tier Limitations:

1. **Cold Starts**: Services sleep after 15 minutes of inactivity
   - First request after sleep takes ~50 seconds
   - Subsequent requests are fast
   
2. **750 Hours/Month**: Each service gets 750 free hours
   - If you have 5 services running 24/7, you'll use all hours in ~6 days
   - Solution: Services auto-sleep when idle (built into free tier)

3. **Build Time**: Each service rebuilds on every push
   - Can take 5-10 minutes per service
   - Use Docker cache to speed up

### Vercel Free Tier:

- ✅ Unlimited deployments
- ✅ Automatic HTTPS
- ✅ 100GB bandwidth/month
- ✅ No cold starts for static sites

---

## 🔐 Security Best Practices

### Never commit these to GitHub:

- ❌ Firebase private keys
- ❌ Gemini API keys
- ❌ `.env` files

### Always use environment variables in Render:

1. Dashboard → Select Service → "Environment"
2. Add secret keys there (not in code)
3. Use `process.env.VARIABLE_NAME` in code

---

## 🐛 Troubleshooting

### Service Won't Start

**Check logs:**
1. Render Dashboard → Select Service → "Logs"
2. Look for errors in startup

**Common issues:**
- Missing environment variables
- Wrong Dockerfile path
- Missing dependencies in `requirements.txt` or `package.json`

### CORS Errors

Update `backend/server.js` CORS configuration to include your frontend URL.

### Service URL Not Found

Make sure:
- Service is deployed and running (green status)
- Environment variables are set correctly
- Service URLs don't have trailing slashes

### Cold Start Too Slow

**Solutions:**
- Use a cron job to ping services every 10 minutes
- Upgrade to paid plan ($7/month per service)
- Combine services to reduce number of deployments

---

## 📊 Monitoring Your Deployment

### View Logs:
```
Render Dashboard → Service → Logs (real-time)
```

### View Metrics:
```
Render Dashboard → Service → Metrics
- CPU usage
- Memory usage
- Request count
```

---

## 🎉 Congratulations!

Your AI Interview Prep app is now deployed and accessible worldwide! 

**Share your deployed app:**
- Frontend URL: `https://your-app.vercel.app`
- Include in resume under "Projects"
- Add to portfolio
- Share on LinkedIn

---

## 📞 Need Help?

- Render Documentation: https://render.com/docs
- Vercel Documentation: https://vercel.com/docs
- Firebase Documentation: https://firebase.google.com/docs

---

## 🚀 Next Steps

1. **Custom Domain**: Add your own domain (free on Vercel/Render)
2. **Monitoring**: Set up uptime monitoring (UptimeRobot)
3. **Analytics**: Add Google Analytics to frontend
4. **CI/CD**: Auto-deploy on GitHub push (already set up!)
5. **Testing**: Add unit tests before deployment

---

**Created by**: AI Interview Prep Team  
**Last Updated**: November 2025
