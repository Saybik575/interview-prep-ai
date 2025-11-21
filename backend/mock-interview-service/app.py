import os
import json
import argparse
import logging
import traceback
import random
import re
from datetime import datetime
from typing import Optional, Tuple

from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Google GenAI SDK
from google import genai
from google.genai import types

# Load .env
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# Config
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable is required")
GEMINI_MODEL_NAME = os.environ.get("GEMINI_MODEL_NAME", "gemini-2.5-flash")

# Client
client = genai.Client(api_key=GEMINI_API_KEY)

# Flask
app = Flask(__name__)
CORS(app)
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


# ---------------- Helpers ----------------

def _strip_code_fence(text: Optional[str]) -> Optional[str]:
    if not text:
        return text
    s = text.strip()
    s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\s*```$", "", s, flags=re.IGNORECASE)
    return s.strip()

def _attempt_repair_json(s: str, min_length: int = 20, max_iters: int = 1200) -> Tuple[Optional[dict], str]:
    if not s or len(s) < min_length:
        return None, s
    trimmed = s.strip()
    start = trimmed.find("{")
    if start != -1:
        trimmed = trimmed[start:]
    iters = 0
    while iters < max_iters and len(trimmed) >= min_length:
        try:
            obj = json.loads(trimmed)
            if isinstance(obj, dict):
                return obj, trimmed
            return None, trimmed
        except Exception:
            trimmed = trimmed[:-1]
            iters += 1
    return None, trimmed

def _extract_text_from_response(resp) -> Tuple[str, object]:
    raw = getattr(resp, "text", None)
    if raw and isinstance(raw, str) and raw.strip():
        return raw, resp
    candidates = getattr(resp, "candidates", None)
    if candidates and len(candidates) > 0:
        candidate = candidates[0]
        content = getattr(candidate, "content", None)
        if content:
            parts = getattr(content, "parts", None)
            if parts:
                joined = "".join([p for p in parts if isinstance(p, str)])
                if joined.strip():
                    return joined, resp
            txt = getattr(content, "text", None)
            if txt and isinstance(txt, str) and txt.strip():
                return txt, resp
        disp = getattr(candidate, "display_text", None)
        if disp and isinstance(disp, str) and disp.strip():
            return disp, resp
    out = getattr(resp, "output", None)
    if out and isinstance(out, str) and out.strip():
        return out, resp
    return "", resp


# ---------------- Categorized role templates (Option C) ----------------
# Keep each template very short to minimize tokens while offering variety.

ROLE_PROMPT_TEMPLATES = {
    # Software Engineering
    "Software Engineering": {
        "Software Engineer": [
            "Design a rate-limited API supporting bursty traffic.",
            "How would you design a microservice with transactional workflow?",
            "Plan zero-downtime deploys for a critical endpoint."
        ],
        "Frontend Developer": [
            "Design a responsive web app architecture with state management.",
            "How to optimize initial page load for a React app?"
        ],
        "Backend Developer": [
            "Design a scalable REST service with caching and DB scaling.",
            "How to implement idempotent background job processing?"
        ],
        "Full-Stack Developer": [
            "Describe an end-to-end feature: DB → API → UI deployment.",
            "Trade-offs between server-side rendering and CSR."
        ],
        "Mobile Developer": [
            "Design offline-first syncing for a mobile app.",
            "How to manage feature rollouts across mobile versions?"
        ],
        "Embedded Systems Engineer": [
            "Design a power-efficient sensor data pipeline.",
            "How to update firmware safely in-field?"
        ],
        "Game Developer": [
            "Design a real-time multiplayer matchmaking system.",
            "How to synchronize game state with minimal latency?"
        ],
        "Blockchain Developer": [
            "Design a smart-contract based token transfer with safety checks.",
            "How to architect off-chain / on-chain data flows?"
        ]
    },

    # Data & AI
    "Data & AI": {
        "Data Engineer": [
            "Design a streaming pipeline for per-key ordering and low latency.",
            "How to handle schema evolution in a large data lake?"
        ],
        "Data Scientist": [
            "Design an ML pipeline for a classification task with monitoring.",
            "How to detect and handle model drift in production?"
        ],
        "Machine Learning Engineer": [
            "How to productionize a deep-learning model with CI/CD?",
            "Design feature validation and model rollout process."
        ],
        "MLOps Engineer": [
            "Design automated retraining and model promotion pipelines.",
            "How to manage model lineage and reproducibility?"
        ],
        "Business Intelligence Engineer": [
            "Design a star-schema for analytics and explain ingest cadence.",
            "How to optimize complex analytical queries for speed?"
        ],
        "Data Analyst": [
            "Design an analysis plan to measure a product change.",
            "How to build clean dashboards for non-technical stakeholders?"
        ],
        "Quantitative Analyst": [
            "Design a backtest framework for a trading strategy.",
            "How to stress-test model assumptions and data quality?"
        ]
    },

    # Cloud, DevOps & SRE
    "Cloud & DevOps": {
        "DevOps Engineer": [
            "Design CI/CD pipelines for multiple environments.",
            "How to ensure immutable infrastructure and safe rollbacks?"
        ],
        "SRE": [
            "Set SLOs for a user-facing service and define alerting.",
            "Design incident runbook and automated remediation."
        ],
        "Cloud Engineer": [
            "Design a multi-region deployment with low latency reads.",
            "How to choose managed services vs self-hosting for infra?"
        ],
        "MLOps Engineer": [
            "Design scalable model serving with autoscaling and caching."
        ]
    },

    # Security & Privacy
    "Security": {
        "Cybersecurity Engineer": [
            "Design detection for credential stuffing and brute-force attacks.",
            "How to design least-privilege access and secrets rotation?"
        ],
        "SOC Analyst": [
            "Design an alert triage workflow and playbook.",
            "Which signals reduce false positives in threat detection?"
        ],
        "Privacy Engineer": [
            "How to design data minimization and anonymization for analytics?",
            "Plan a GDPR-compliant data access audit flow."
        ]
    },

    # Product, Design & UX
    "Product & Design": {
        "Product Manager": [
            "Prioritize features for next quarter with limited resources.",
            "Design an experiment to test onboarding improvements."
        ],
        "Product Designer": [
            "Design a mobile onboarding flow to reduce churn.",
            "How to validate a design hypothesis with prototypes?"
        ],
        "UX Researcher": [
            "Plan research to validate a new search experience.",
            "How to synthesize qualitative feedback into product insight?"
        ],
        "UX/UI Designer": [
            "Design accessible forms that reduce user drop-off.",
            "How to create a design system for rapid iteration?"
        ]
    },

    # Business, Marketing & Ops
    "Business & Marketing": {
        "Project Manager": [
            "Plan a cross-functional release with dependencies and risks.",
            "How to measure on-time delivery and reduce blockers?"
        ],
        "Program Manager": [
            "Coordinate multiple teams for a product launch; define KPIs.",
            "How to balance long-term investments vs short-term needs?"
        ],
        "Business Analyst": [
            "Translate stakeholder goals into measurable requirements.",
            "Design a dashboard to measure operational KPIs."
        ],
        "Digital Marketer": [
            "Design a paid acquisition funnel and measure LTV.",
            "How to A/B test landing pages to improve conversion?"
        ],
        "Growth Analyst": [
            "Design experiments to improve activation and retention.",
            "Which metrics indicate successful viral growth?"
        ],
        "Sales Engineer": [
            "Design a technical demo that highlights product differentiation.",
            "How to manage POC environments for prospects?"
        ],
        "Customer Success Manager": [
            "Design onboarding to reduce time-to-first-value for enterprise."
        ]
    },

    # Creative & Content
    "Creative": {
        "Content Writer": [
            "Write a short content plan for educating new users.",
            "How to structure a long-form tutorial for SEO?"
        ],
        "Copywriter": [
            "Write a product landing headline that communicates value.",
            "Test copy variants for higher CTA conversion."
        ],
        "Graphic Designer": [
            "Design a hero image system for varying screen sizes.",
            "How to create consistent branding across channels?"
        ],
        "Video Editor": [
            "Outline an efficient edit workflow for short social clips."
        ]
    },

    # Healthcare & Specialized
    "Healthcare": {
        "Healthcare Data Analyst": [
            "Design a pipeline to combine EHR and claims data for analytics.",
            "How to ensure patient privacy in analytics pipelines?"
        ],
        "Clinical Operations Coordinator": [
            "Plan study logistics and data collection for a clinical trial."
        ]
    },

    # Default fallback
    "default": {
        "default": [
            "Describe a concise technical design relevant to this role and its trade-offs."
        ]
    }
}


def _get_role_instruction(category: str, role: str) -> str:
    if not category or not role:
        # fallback
        return random.choice(ROLE_PROMPT_TEMPLATES["default"]["default"])
    cat = ROLE_PROMPT_TEMPLATES.get(category, ROLE_PROMPT_TEMPLATES["default"])
    role_templates = cat.get(role) if isinstance(cat, dict) else None
    if not role_templates:
        # try to find role across categories
        for c in ROLE_PROMPT_TEMPLATES.values():
            if isinstance(c, dict) and role in c:
                role_templates = c[role]
                break
    if not role_templates:
        return random.choice(ROLE_PROMPT_TEMPLATES["default"]["default"])
    return random.choice(role_templates)


# ---------------- Endpoints ----------------

@app.route("/start", methods=["POST"])
def start_interview():
    data = request.get_json() or {}
    category = data.get("category")
    job_position = data.get("job_position") or data.get("position") or "General"
    difficulty = data.get("difficulty", "Beginner")
    user_id = data.get("userId", "anon")
    session_id = data.get("sessionId") or f"mock_sess_{user_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}"

    role_instruction = _get_role_instruction(category, job_position)
    prompt = f"Role:{job_position} ({category}) Difficulty:{difficulty}\nFocus: {role_instruction}\n\nAsk one concise interview question."

    fallback = f"Hello — let's begin for {job_position} ({difficulty}). {role_instruction}"

    try:
        resp = client.models.generate_content(
            model=GEMINI_MODEL_NAME,
            contents=[prompt],
            config=types.GenerateContentConfig(temperature=0.55, max_output_tokens=220)
        )
        text, _ = _extract_text_from_response(resp)
        if not text or not text.strip():
            text = fallback
        return jsonify({"ai_message": {"role": "assistant", "content": text}, "sessionId": session_id})
    except Exception as e:
        tb = traceback.format_exc()
        logger.exception("start_interview error: %s", str(e))
        return jsonify({"error": str(e), "stack": tb[:1200], "ai_message": {"role": "assistant", "content": fallback}}), 500


def _summarize_history_2bullets(history_text: str) -> str:
    if not history_text or not history_text.strip():
        return "No prior history."
    prompt = f"Summarize the interview history in 2 very short bullets (<=12 words each):\n{history_text}\nBullets:"
    try:
        resp = client.models.generate_content(
            model=GEMINI_MODEL_NAME,
            contents=[prompt],
            config=types.GenerateContentConfig(temperature=0.0, max_output_tokens=100)
        )
        raw, _ = _extract_text_from_response(resp)
        return _strip_code_fence(raw) or "No prior history."
    except Exception as e:
        logger.exception("summarize failed: %s", str(e))
        return "No prior history."


@app.route("/evaluate", methods=["POST"])
def evaluate():
    data = request.get_json() or {}
    category = data.get("category")
    job_position = data.get("job_position") or data.get("position")
    difficulty = data.get("difficulty")
    messages = data.get("messages", [])
    session_id = data.get("sessionId", "unknown")

    if not job_position or not difficulty or not messages:
        return jsonify({"error": "Missing required fields."}), 400

    last_ai = next((m for m in messages[::-1] if m.get("role") == "assistant"), None)
    last_user = next((m for m in messages[::-1] if m.get("role") == "user"), None)
    if not last_ai or not last_user:
        return jsonify({"error": "Need at least one AI question and one user answer."}), 400

    user_answer = last_user.get("content", "") or ""

    # detect pasted/AI-generated answers
    ai_patterns = [r"\bchatgpt\b", r"\bgpt-?\d?\b", r"\bopenai\b", r"generated by", r"as chatgpt", r"assistant said", r"chat gpt"]
    for pat in ai_patterns:
        if re.search(pat, user_answer, flags=re.IGNORECASE):
            logger.info("Detected likely AI-pasted answer; short-circuiting evaluation.")
            return jsonify({
                "score": 0,
                "positive_feedback": "",
                "improvement": (
                    "It appears your answer includes AI-generated content. "
                    "Please respond in your own words so we can evaluate your thinking."
                ),
                "next_question": f"Please re-answer in your own words: {last_ai.get('content')}"
            })

    # summarize history
    conversation_history = messages[:-2]
    history_text = "\n".join([f"{m.get('role')}: {m.get('content')}" for m in conversation_history])
    try:
        summary = _summarize_history_2bullets(history_text)
    except Exception:
        summary = "No prior history."

    eval_prompt = (
        f"Role: {job_position} (category: {category}) Difficulty: {difficulty}\n"
        "Provide ONLY a JSON object with keys: score (0-10), positive_feedback, improvement, next_question.\n"
        "NO extra text outside JSON.\n\n"
        f"Summary:\n{summary}\n\n"
        f"Question:\n{last_ai.get('content')}\n\n"
        f"Answer:\n{user_answer}"
    )

    def call_eval(max_tokens: int):
        resp = client.models.generate_content(
            model=GEMINI_MODEL_NAME,
            contents=[eval_prompt],
            config=types.GenerateContentConfig(temperature=0.0, max_output_tokens=max_tokens)
        )
        raw, full = _extract_text_from_response(resp)
        try:
            usage = getattr(resp, "usage_metadata", None) or getattr(resp, "usage", None)
            logger.info("Eval usage metadata: %s", str(usage))
        except Exception:
            pass
        return (raw or "").strip(), full

    try:
        raw_text, full_resp = call_eval(1200)
        if not raw_text:
            raw_text, full_resp = call_eval(2048)
        if not raw_text:
            logger.warning("Evaluation returned empty after retry; diagnostic: %s", str(full_resp)[:1500])
            return jsonify({"error": "AI did not return valid JSON evaluation.", "raw_text_preview": ""}), 500

        # Strip markdown code fences more aggressively
        cleaned = raw_text.strip()
        logger.info("Raw response length: %d. First 200 chars: %s", len(raw_text), raw_text[:200])
        
        # Remove ```json or ``` at start
        cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned, flags=re.IGNORECASE | re.MULTILINE)
        # Remove ``` at end
        cleaned = re.sub(r'\s*```\s*$', '', cleaned, flags=re.MULTILINE)
        cleaned = cleaned.strip()
        
        # Find JSON object boundaries
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        
        if start == -1 or end == -1 or end <= start:
            logger.warning("No JSON block found. Cleaned: %s", cleaned[:500])
            return jsonify({"error": "AI did not return JSON.", "raw_text_preview": raw_text[:800]}), 500

        block = cleaned[start:end+1]
        logger.info("Extracted block length: %d. Last 100 chars: %s", len(block), block[-100:])

        # brace balancing
        opens = block.count("{")
        closes = block.count("}")
        if closes < opens:
            logger.info("Balancing JSON braces: opens=%s closes=%s", opens, closes)
            block = block + ("}" * (opens - closes))

        try:
            parsed = json.loads(block)
        except Exception as parse_error:
            logger.info("Initial parse failed, attempting repair. Error: %s", str(parse_error))
            repaired_obj, repaired_text = _attempt_repair_json(block, min_length=20, max_iters=1200)
            if repaired_obj:
                parsed = repaired_obj
                logger.info("Successfully repaired JSON")
            else:
                logger.warning("Final JSON parse failed. Raw preview: %s", raw_text[:800])
                return jsonify({"error": "JSON parsing failed.", "raw_text_preview": raw_text[:800]}), 500

        feedback = {
            "score": int(parsed.get("score", 0)),
            "positive_feedback": parsed.get("positive_feedback", "") or parsed.get("positives", ""),
            "improvement": parsed.get("improvement", "") or parsed.get("areas_for_improvement", ""),
            "next_question": parsed.get("next_question", "") or parsed.get("nextQuestion", "") or _get_role_instruction(category, job_position)
        }

        return jsonify(feedback)

    except Exception as exc:
        tb = traceback.format_exc()
        logger.exception("Unexpected error in evaluate: %s\n%s", str(exc), tb)
        return jsonify({"error": f"Internal server error: {str(exc)}"}), 500


# Entrypoint
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Mock Interview Flask Service (categorized roles)")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 5004)), help="Port to run the service on.")
    args = parser.parse_args()
    logger.info("Starting mock interview service on port %s", args.port)
    app.run(host="0.0.0.0", port=args.port, debug=True)