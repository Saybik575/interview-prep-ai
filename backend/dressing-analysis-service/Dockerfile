# Dressing Analysis Service Dockerfile (Gemini Vision API)
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY gemini_dressing_service.py .

# Expose port
EXPOSE 5002

# Environment variable for API key (set in Render dashboard)
ENV GEMINI_API_KEY=""

# Run the application
CMD ["python", "gemini_dressing_service.py"]
