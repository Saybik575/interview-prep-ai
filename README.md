# 🤖 AI-Powered Interview Preparation App

A comprehensive interview preparation platform that leverages artificial intelligence to help users dramatically improve their interview skills through **resume analysis**, **posture training**, **dressing sense guidance**, and **AI-driven mock interviews**.

## Table of Contents
- [Demo](#demo)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Quick Start](#-quick-start)
- [Firebase Setup](#️-firebase-setup)
- [Project Structure](#-project-structure)
- [Routes](#-available-routes)
- [Customization](#-customization)
- [Deployment](#-deployment)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [Acknowledgments](#-acknowledgments)

## Demo

### Video Demonstration

[![Watch the demo video](https://img.shields.io/badge/Watch%20Video-Demo-blue)](https://drive.google.com/file/d/1dHcEr6sRnsCOlr10X2fsYgE9TP_MM1ov/view?usp=drive_link)

*(Video hosted on Google Drive — face blurred for privacy.)*

## ✨ Features

### Core Functionality

* **Resume Analysis:** AI-powered resume review providing actionable optimization suggestions to highlight your strengths.
* **Posture Training:** Real-time posture correction and body language tips during mock interviews using computer vision.
* **Dressing Sense:** Professional attire recommendations and personalized style guidance based on industry and role.
* **Mock Interviews:** AI-driven interview simulations with dynamic questioning and personalized, in-depth feedback on content, delivery, and non-verbal cues.

---

### Technical Features

* **Modern UI/UX:** Built with **React** and **Tailwind CSS** for a fast, responsive, and intuitive user experience.
* **Real-time Processing:** Instant feedback for resume analysis, posture correction, and mock interview performance.
* **Secure Authentication:** User data is protected using **Firebase Authentication**.
* **RESTful API:** Robust backend services provided by **Express.js** on **Node.js**.
* **Cloud Integration:** Utilizes **Firebase Firestore** for database operations and **Firebase Storage** for file handling.

## ⚙️ Tech Stack

| Category | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | React 18, React Router | Modern UI development using Functional Components and Hooks. |
| **Styling** | Tailwind CSS, PostCSS, Autoprefixer | Utility-first CSS framework for rapid and consistent styling. |
| **Authentication/DB** | Firebase (Auth, Firestore, Storage) | Client-side integration for secure authentication and cloud database/storage. |
| **Backend (API)** | Node.js, Express.js | RESTful API handling requests, authentication flows, and business logic. |
| **Backend (ML Services)** | Python, Flask | Handles machine learning inference for resume analysis, posture detection, and related AI models. |
| **Admin/Service** | Firebase Admin SDK | Secure server-side access for Firestore, Authentication, and Storage operations. |
| **Dev Tools** | Nodemon, dotenv | Used for rapid development and environment variable management. |

---

## 🚀 Quick Start

### Prerequisites

* **Node.js** v16 or higher
* **npm** or **yarn**
* A **Firebase project** (set up as described in the "Firebase Setup" section)

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd interview-prep-ai
````

### 2\. Frontend Setup

The frontend is a React application running on port **3000**.

```bash
cd frontend
npm install
```

**Create `.env.local`** in the `frontend/` directory and populate it with your Firebase Web Config and backend URL:

```
REACT_APP_FIREBASE_API_KEY=your_api_key_here
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=123456789
REACT_APP_FIREBASE_APP_ID=your_app_id
REACT_APP_BACKEND_URL=http://localhost:5000
```

**Start the frontend:**

```bash
npm start
```

Runs at: `http://localhost:3000`

### 3\. Backend Setup

The backend is an Express server running on port **5000**.

```bash
cd ../backend
npm install
```

**Create `.env`** in the `backend/` directory and securely provide your Firebase Admin SDK credentials:

```
PORT=5000
NODE_ENV=development
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY_ID=your_private_key_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n" # Ensure Newlines are preserved
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_CLIENT_ID=your_client_id
FIREBASE_AUTH_URI=[https://accounts.google.com/o/oauth2/auth](https://accounts.google.com/o/oauth2/auth)
FIREBASE_TOKEN_URI=[https://oauth2.googleapis.com/token](https://oauth2.googleapis.com/token)
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=[https://www.googleapis.com/oauth2/v1/certs](https://www.googleapis.com/oauth2/v1/certs)
FIREBASE_CLIENT_X509_CERT_URL=your_cert_url
```

> **Note:** The `FIREBASE_PRIVATE_KEY` must be enclosed in quotes and contain the actual newline characters (`\n`).

**Start backend in development mode:**

```bash
npm run dev
```

Backend accessible at: `http://localhost:5000`

-----

## ☁️ Firebase Setup

Follow these steps to configure your Firebase project for the application.

### 1\. Create Firebase Project

  * Open the [Firebase Console](https://console.firebase.google.com/).
  * Create a new project.
  * Enable **Authentication**, **Firestore**, and **Storage**.

### 2\. Configure Authentication

  * Navigate to **Authentication** in the Firebase Console.
  * Under the "Sign-in method" tab, enable **Email/Password** and **Google** sign-in providers.
  * Add `http://localhost:3000` as an authorized domain.

### 3\. Get Firebase Web Config

  * Go to **Project Settings** (gear icon).
  * Under "Your Apps", register a new **Web App** (\</\> icon).
  * Copy the config object and use the values to populate the `frontend/.env.local` file.

### 4\. Setup Firebase Admin SDK

  * Go to **Project Settings** → **Service Accounts**.
  * Click **Generate new private key** and download the JSON file.
  * Use the `project_id`, `private_key_id`, `private_key`, and `client_email` values from this JSON to populate the `backend/.env` file.

### 5\. Update Security Rules

The repository includes template files for security rules.

  * Update **Firestore rules** by copying the contents of `firestore.rules`.
  * Update **Storage rules** by copying the contents of `storage.rules`.

-----

## 🗺️ Project Structure

```
interview-prep-ai/
├── frontend/                 # React frontend application
│   ├── public/              # Static assets (e.g., index.html)
│   ├── src/                 # Source code
│   │   ├── pages/          # Page components
│   │   │   ├── LandingPage.js
│   │   │   ├── AuthPage.js
│   │   │   └── Dashboard.js
│   │   ├── App.js          # Main app component
│   │   ├── index.js        # Entry point
│   │   ├── index.css       # Tailwind base styles
│   │   └── firebaseConfig.js # Client-side Firebase init
│   ├── package.json
│   ├── tailwind.config.js
│   └── postcss.config.js
├── backend/                  # Express.js backend
│   ├── server.js             # Main server logic and API routes
│   └── package.json
├── firebase.json             # Firebase CLI configuration
├── firestore.rules           # Firestore security rules
├── firestore.indexes.json    # Firestore index configuration
├── storage.rules             # Firebase Storage security rules
└── README.md
```

## 🔗 Available Routes

### Frontend Routes

| Path | Description |
| :--- | :--- |
| `/` | **Landing Page:** Project overview and entry point. |
| `/auth` | **Authentication Page:** Handles user sign-up/sign-in. |
| `/dashboard` | **User Dashboard:** Main hub for features like mock interviews and analysis tools. |

### Backend API Endpoints

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/` | API health check/welcome message. |
| `POST` | `/uploadResume` | Resume upload and AI analysis. |
| `GET` | `/questions` | Fetch specific interview questions. |
| `POST` | `/answers` | Submit user's interview answers for processing. |
| `GET` | `/feedback/:userId` | Fetch personalized user feedback and analytics. |

-----

## 🎨 Customization

### Styling

  * Edit `frontend/src/index.css` for global styling and base layer components.
  * Modify `frontend/tailwind.config.js` to extend Tailwind's default theme (e.g., custom colors, fonts).
  * Add custom components under `frontend/src/pages/` or dedicated components folders.

### Feature Expansion

  * Add new backend routes and logic within `backend/server.js`.
  * Create new pages/views in the frontend.
  * **Integrate additional AI APIs** (e.g., OpenAI, Gemini, etc.) in the backend for advanced processing tasks.

-----

## ⚙️ Deployment

### Frontend (Vercel or Netlify)

1.  Build the production bundle:
    ```bash
    cd frontend
    npm run build
    ```
2.  Upload the generated `build/` folder to your chosen hosting service (Vercel, Netlify, etc.).

### Backend (Railway, Render, Heroku)

1.  Set the required environment variables (`FIREBASE_*`, `PORT`) on the platform's configuration panel.
2.  Deploy the `backend/` folder.

-----

## ⚠️ Troubleshooting

### Frontend Issues

  * Ensure all dependencies are installed (`npm install`).
  * Verify that `frontend/.env.local` exists and contains correct keys.
  * Check that `REACT_APP_BACKEND_URL` is correctly pointing to the running backend.

### Backend Issues

  * Check if the backend is running on the correct port (`5000` by default).
  * Verify Firebase Admin SDK credentials in `backend/.env` are correctly formatted (especially the `FIREBASE_PRIVATE_KEY` with newlines).
  * Ensure **CORS** is correctly configured to allow requests from the frontend's origin (`http://localhost:3000`).

-----

## 🤝 Contributing

1.  Fork the repository.
2.  Create a new feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

## 🙏 Acknowledgments

This project is made possible using the following technologies:

### Frontend
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-0F172A?style=for-the-badge&logo=tailwindcss&logoColor=38BDF8)](https://tailwindcss.com/)

### Backend & API
[![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Flask](https://img.shields.io/badge/Flask-000000?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)

### Cloud Services
[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)

-----

**Author**

Satvik Kumar – Final Year B.Tech Project
