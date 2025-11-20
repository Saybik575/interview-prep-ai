import axios from 'axios';

// Backend API base URL - uses environment variable in production, localhost in development
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

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
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
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
    if (error.code === 'ECONNABORTED') {
      console.error('Request timeout - backend service may be waking up from sleep');
      error.message = 'Service is starting up, please wait and try again in 30 seconds';
    } else if (error.response?.status === 502) {
      console.error('502 Bad Gateway - backend service is likely sleeping');
      error.message = 'Backend service is waking up. Please wait 30 seconds and try again.';
    } else if (error.response?.status === 503) {
      console.error('503 Service Unavailable');
      error.message = 'Service temporarily unavailable. Please try again.';
    }
    return Promise.reject(error);
  }
);

export default api;
export { API_BASE_URL };
