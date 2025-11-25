import axios from 'axios';

// Backend API base URL for deployment
// Set REACT_APP_API_URL in Vercel to your Render backend URL, e.g. https://your-backend.onrender.com
const API_BASE_URL = process.env.REACT_APP_API_URL;

// Create axios instance with custom configuration
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // 60 seconds timeout for cold starts
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for debugging
api.interceptors.request.use(
  (config) => {
    // 💡 Helpful console log to confirm the URL being used
    console.log(`API Request: ${config.method?.toUpperCase()} ${API_BASE_URL}${config.url}`);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handling specific network errors
    if (error.code === 'ECONNABORTED') {
      console.error('Request timeout - backend service may be waking up from sleep');
      error.message = 'Service is starting up, please wait and try again in 30 seconds';
    } else if (error.response?.status === 502) {
      console.error('502 Bad Gateway - backend service is likely sleeping');
      error.message = 'Backend service is waking up. Please wait 30 seconds and try again.';
    } else if (error.response?.status === 503) {
      console.error('503 Service Unavailable');
      error.message = 'Service temporarily unavailable. Please try again.';
    } else if (error.response?.status === 404 && error.config.url.includes('/history')) {
       // ❗ Custom error message for history 404
       console.error('History 404: Check if Express is running and routing /api/interview/history correctly.');
       error.message = 'History Service Not Found (404). Ensure your Node.js server is running and the history route is correctly defined.';
    }
    return Promise.reject(error);
  }
);

export default api;
export { API_BASE_URL };