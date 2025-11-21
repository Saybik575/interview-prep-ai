# Dressing Analysis Service - Gemini Vision API

This service analyzes professional attire for job interviews using Google's Gemini Vision API.

## Features

✅ **AI-Powered Analysis** - Uses Gemini 1.5 Flash for accurate clothing assessment
✅ **Comprehensive Scoring** - Evaluates formality, colors, grooming, and overall impression
✅ **Detailed Feedback** - Provides constructive suggestions for improvement
✅ **Easy Deployment** - No model files, just needs API key
✅ **Cost-Effective** - FREE for typical usage (under 1M tokens/day)

## Scoring Components (0-100)

1. **Formality Level** (25 points) - Business professional vs casual
2. **Color Appropriateness** (25 points) - Professional color choices
3. **Grooming & Neatness** (25 points) - Clean, pressed, well-fitted
4. **Overall Impression** (25 points) - First impression impact

## Setup

### 1. Get Gemini API Key

Visit: https://makersuite.google.com/app/apikey

1. Sign in with Google account
2. Click "Get API Key"
3. Create new API key
4. Copy the key

### 2. Configure Environment

Create `.env` file in project root:

```bash
# Gemini API Configuration
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Run Service

```bash
python gemini_dressing_service.py
```

Service runs on port 5002 by default.

## API Endpoint

### POST `/analyze-dressing`

Analyzes professional attire from an image.

**Request:**
```bash
curl -X POST http://localhost:5002/analyze-dressing \
  -F "image=@photo.jpg" \
  -F "userId=user123"
```

**Response:**
```json
{
  "success": true,
  "score": 85,
  "formality_score": 22,
  "color_score": 23,
  "grooming_score": 20,
  "impression_score": 20,
  "feedback": "Excellent professional attire! Navy suit with light blue shirt shows strong business professionalism.",
  "suggestions": [
    "Ensure tie knot is tight and centered",
    "Consider a darker tie for more formal settings"
  ],
  "detected_items": ["suit", "dress shirt", "tie"],
  "timestamp": "2025-11-21T10:30:00.000Z",
  "userId": "user123"
}
```

## Deployment

### Option 1: Render / Railway / Fly.io

1. Create new Web Service
2. Connect GitHub repository
3. Set build command: `pip install -r requirements.txt`
4. Set start command: `python gemini_dressing_service.py`
5. Add environment variable: `GEMINI_API_KEY`

### Option 2: Docker

```bash
docker build -t dressing-service .
docker run -p 5002:5002 -e GEMINI_API_KEY=your_key dressing-service
```

### Option 3: Google Cloud Run

```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/dressing-service
gcloud run deploy --image gcr.io/PROJECT_ID/dressing-service \
  --set-env-vars GEMINI_API_KEY=your_key
```

## Cost Estimation

**Gemini 1.5 Flash Pricing:**
- FREE tier: 15 requests/min, 1M tokens/day, 1,500 requests/day
- Paid: $0.075 per 1M input tokens

**Typical Usage:**
- 1 image analysis = ~1,500 tokens
- 100 analyses/day = 150,000 tokens = **FREE**
- 1,000 analyses/day = 1.5M tokens = ~$0.11

**Conclusion:** Essentially FREE for most applications!

## Migration from YOLO

This service replaces the previous YOLO-based dressing analysis with significant improvements:

- ✅ Better accuracy (Gemini understands clothing context)
- ✅ No model files to deploy (~6MB savings)
- ✅ Smaller Docker images
- ✅ Faster startup (no model loading)
- ✅ More detailed feedback
- ✅ Easier deployment

Old YOLO service (`yolo_dressing_service.py`) is kept for reference but no longer used.

## Troubleshooting

**Error: "GEMINI_API_KEY not found"**
- Ensure `.env` file exists with valid API key
- Check environment variable is set in deployment platform

**Error: "Rate limit exceeded"**
- Free tier: 15 requests/min limit
- Add retry logic or upgrade to paid tier

**Low scores despite good attire**
- Ensure good lighting in photo
- Show upper body clearly
- Use high-quality images

## Health Check

```bash
curl http://localhost:5002/health
```

Response:
```json
{
  "status": "healthy",
  "service": "dressing-analysis-gemini",
  "gemini_api": "configured",
  "timestamp": "2025-11-21T10:30:00.000Z"
}
```
