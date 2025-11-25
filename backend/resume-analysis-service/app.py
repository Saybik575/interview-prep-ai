from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv
load_dotenv()
from werkzeug.utils import secure_filename
import docx2txt
from pdfminer.high_level import extract_text
import json
import re
from google.cloud import firestore
from google.oauth2 import service_account

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'doc'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

SKILLS = ["Python", "Machine Learning", "Data Science", "React", "SQL"]
if os.path.exists('skills.json'):
    try:
        with open('skills.json', 'r') as f:
            SKILLS = json.load(f)
    except Exception:
        pass

# Initialize Firestore with service account credentials from environment
db = None
try:
    # Check if credentials are provided via environment variables
    project_id = os.environ.get("FIREBASE_PROJECT_ID")
    private_key = os.environ.get("FIREBASE_PRIVATE_KEY")
    client_email = os.environ.get("FIREBASE_CLIENT_EMAIL")
    
    if project_id and private_key and client_email:
        # Create credentials from environment variables
        credentials_dict = {
            "type": "service_account",
            "project_id": project_id,
            "private_key": private_key.replace('\\n', '\n'),
            "client_email": client_email,
            "token_uri": "https://oauth2.googleapis.com/token",
        }
        
        credentials = service_account.Credentials.from_service_account_info(credentials_dict)
        db = firestore.Client(project=project_id, credentials=credentials)
        print(f"✅ Firestore connected successfully (project: {project_id})")
    else:
        print("⚠️ Missing Firebase credentials in environment variables")
        print(f"   PROJECT_ID: {'✓' if project_id else '✗'}")
        print(f"   PRIVATE_KEY: {'✓' if private_key else '✗'}")
        print(f"   CLIENT_EMAIL: {'✓' if client_email else '✗'}")
        db = None
except Exception as e:
    print(f"⚠️ Firestore initialization failed: {e}")
    db = None

def simple_grammar_check(text):
    """Simple grammar checking without external dependencies"""
    issues = []
    
    # Check for common issues
    sentences = re.split(r'[.!?]+', text)
    for i, sentence in enumerate(sentences[:10]):  # Check first 10 sentences
        sentence = sentence.strip()
        if not sentence:
            continue
            
        # Check if sentence starts with lowercase (except after colon)
        if sentence and sentence[0].islower() and i > 0:
            issues.append({
                'message': 'Sentence should start with a capital letter',
                'suggestions': [sentence.capitalize()],
                'context': sentence[:100],
                'offset': -1,
                'length': 0
            })
        
        # Check for double spaces
        if '  ' in sentence:
            issues.append({
                'message': 'Multiple consecutive spaces found',
                'suggestions': [sentence.replace('  ', ' ')],
                'context': sentence[:100],
                'offset': -1,
                'length': 0
            })
    
    return issues[:8]  # Return max 8 issues

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# Resume history endpoint for frontend compatibility
@app.route('/api/resume/history', methods=['GET'])
def get_resume_history():
    user_id = request.args.get('userId')
    if not user_id:
        return jsonify({'error': 'Missing userId'}), 400
    if db is None:
        return jsonify({'error': 'Firestore not initialized'}), 500
    try:
        # Query Firestore for resume analysis history for the user
        docs = db.collection('resume_analysis').where('userId', '==', user_id).order_by('timestamp', direction=firestore.Query.DESCENDING).limit(20).stream()
        history = []
        for doc in docs:
            data = doc.to_dict()
            data['id'] = doc.id
            history.append(data)
        return jsonify({'history': history}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/analyze-resume', methods=['POST'])
def analyze_resume():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    job_description = request.form.get('job_description', '')
    user_id = request.form.get('userId', 'demoUser')
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        ext = filename.rsplit('.', 1)[1].lower()
        try:
            if ext == 'pdf':
                text = extract_text(filepath)
            elif ext in ('docx', 'doc'):
                text = docx2txt.process(filepath)
            else:
                return jsonify({'error': 'Unsupported file type'}), 400
        except Exception as e:
            try:
                os.remove(filepath)
            except Exception:
                pass
            return jsonify({'error': str(e)}), 500

        if not text or not text.strip():
            try:
                os.remove(filepath)
            except Exception:
                pass
            return jsonify({'error': 'Could not extract text from resume'}), 400

        found_skills = [skill for skill in SKILLS if skill.lower() in text.lower()]
        
        # Calculate skill score (0-100)
        try:
            total_skills = len(SKILLS) if SKILLS else 0
            if total_skills > 0:
                skill_score = round(len(found_skills) / total_skills * 100)
            else:
                skill_score = 0
        except Exception:
            skill_score = 0

        # Calculate similarity and ATS scores using proper ATS methodology
        similarity_with_jd = None
        ats_score = 0
        missing_keywords = []
        
        if job_description and job_description.strip():
            # Professional ATS-style keyword matching with semantic understanding
            try:
                jd_lower = job_description.lower()
                resume_lower = text.lower()
                
                # Stopwords to filter out
                stopwords = {
                    'the', 'and', 'for', 'with', 'using', 'this', 'that', 'from', 'will', 
                    'can', 'has', 'have', 'are', 'were', 'been', 'being', 'our', 'your',
                    'about', 'into', 'through', 'during', 'before', 'after', 'above',
                    'such', 'when', 'where', 'who', 'how', 'what', 'which', 'their',
                    'them', 'these', 'those', 'should', 'would', 'could', 'may', 'might',
                    'more', 'most', 'other', 'some', 'than', 'too', 'very', 'also',
                    'all', 'both', 'each', 'few', 'any', 'every', 'either', 'neither'
                }
                
                # Universal synonym/related terms mapping for semantic matching
                # Covers tech, business, finance, marketing, HR, healthcare, and more
                universal_synonyms = {
                    # Technology & Engineering
                    'python': ['python', 'py', 'python3'],
                    'javascript': ['javascript', 'js', 'node', 'nodejs', 'node.js'],
                    'sql': ['sql', 'mysql', 'postgresql', 'postgres', 't-sql', 'plsql', 'database'],
                    'aws': ['aws', 'amazon web services', 'ec2', 's3', 'lambda', 'cloud'],
                    'machine learning': ['machine learning', 'ml', 'ai', 'deep learning', 'neural', 'artificial intelligence'],
                    'data': ['data', 'dataset', 'database', 'databases', 'analytics'],
                    'api': ['api', 'rest', 'restful', 'graphql', 'endpoint', 'web service'],
                    'docker': ['docker', 'container', 'containers', 'containerization'],
                    'kubernetes': ['kubernetes', 'k8s', 'orchestration'],
                    'git': ['git', 'github', 'gitlab', 'version control', 'bitbucket'],
                    'agile': ['agile', 'scrum', 'sprint', 'kanban'],
                    'testing': ['testing', 'test', 'qa', 'quality assurance', 'junit', 'pytest'],
                    'ci/cd': ['ci/cd', 'continuous integration', 'continuous deployment', 'jenkins', 'github actions'],
                    
                    # Marketing & Communications
                    'seo': ['seo', 'search engine optimization', 'sem', 'search marketing'],
                    'social media': ['social media', 'facebook', 'instagram', 'twitter', 'linkedin', 'tiktok'],
                    'content': ['content', 'copywriting', 'writing', 'editorial'],
                    'branding': ['branding', 'brand', 'brand identity', 'brand strategy'],
                    'campaign': ['campaign', 'marketing campaign', 'advertising campaign'],
                    'email marketing': ['email marketing', 'email campaigns', 'newsletter'],
                    'analytics': ['analytics', 'google analytics', 'web analytics', 'data analysis'],
                    
                    # Finance & Accounting
                    'accounting': ['accounting', 'bookkeeping', 'financial accounting'],
                    'budgeting': ['budgeting', 'budget', 'financial planning'],
                    'excel': ['excel', 'microsoft excel', 'spreadsheet', 'spreadsheets'],
                    'financial analysis': ['financial analysis', 'financial modeling', 'forecasting'],
                    'gaap': ['gaap', 'generally accepted accounting principles', 'accounting standards'],
                    'quickbooks': ['quickbooks', 'accounting software'],
                    'tax': ['tax', 'taxation', 'tax preparation'],
                    
                    # Human Resources
                    'recruiting': ['recruiting', 'recruitment', 'talent acquisition', 'hiring'],
                    'onboarding': ['onboarding', 'employee onboarding', 'new hire'],
                    'performance management': ['performance management', 'performance reviews', 'appraisal'],
                    'compensation': ['compensation', 'benefits', 'compensation and benefits'],
                    'hris': ['hris', 'human resources information system', 'hr software'],
                    'training': ['training', 'employee training', 'learning and development', 'l&d'],
                    
                    # Sales & Business Development
                    'sales': ['sales', 'selling', 'business development', 'revenue'],
                    'crm': ['crm', 'customer relationship management', 'salesforce'],
                    'lead generation': ['lead generation', 'prospecting', 'leads'],
                    'negotiation': ['negotiation', 'contract negotiation', 'deal closing'],
                    'pipeline': ['pipeline', 'sales pipeline', 'sales funnel'],
                    
                    # Healthcare
                    'patient care': ['patient care', 'clinical care', 'healthcare'],
                    'electronic health records': ['ehr', 'electronic health records', 'emr', 'medical records'],
                    'nursing': ['nursing', 'registered nurse', 'rn', 'clinical nursing'],
                    'hipaa': ['hipaa', 'patient privacy', 'healthcare compliance'],
                    
                    # Project Management
                    'project management': ['project management', 'pmp', 'project manager'],
                    'stakeholder': ['stakeholder', 'stakeholders', 'stakeholder management'],
                    'timeline': ['timeline', 'schedule', 'scheduling', 'planning'],
                    'risk management': ['risk management', 'risk assessment', 'risk mitigation'],
                    
                    # General Business
                    'leadership': ['leadership', 'team leadership', 'managing', 'management'],
                    'communication': ['communication', 'communications', 'verbal communication', 'written communication'],
                    'collaboration': ['collaboration', 'teamwork', 'cross-functional'],
                    'problem solving': ['problem solving', 'problem-solving', 'analytical'],
                    'customer service': ['customer service', 'customer support', 'client service'],
                }
                
                # Extract keywords from JD
                jd_keywords = set()
                for word in re.findall(r'\b[\w+/#-]+\b', jd_lower):
                    word_clean = word.strip('/#-')
                    if len(word_clean) > 2 and word_clean not in stopwords:
                        jd_keywords.add(word_clean)
                
                # Extract keywords from resume
                resume_keywords = set()
                for word in re.findall(r'\b[\w+/#-]+\b', resume_lower):
                    word_clean = word.strip('/#-')
                    if len(word_clean) > 2 and word_clean not in stopwords:
                        resume_keywords.add(word_clean)
                
                # 1. EXACT KEYWORD MATCHING + SEMANTIC MATCHING (60% weight)
                exact_matches = jd_keywords & resume_keywords
                
                # Add semantic matches (synonyms/related terms)
                semantic_matches = 0
                semantic_matched_jd_words = set()
                
                for jd_word in jd_keywords:
                    if jd_word in exact_matches:
                        continue  # Already counted
                    
                    # Check if this JD word has synonyms that appear in resume
                    matched = False
                    for key, synonyms in universal_synonyms.items():
                        if jd_word in synonyms:
                            # Check if any synonym appears in resume
                            if any(syn in resume_keywords or syn in resume_lower for syn in synonyms):
                                semantic_matches += 1
                                semantic_matched_jd_words.add(jd_word)
                                matched = True
                                break
                    
                    # If no synonym match, check for partial/fuzzy matches
                    # This handles variations like "engineer" matching "engineering"
                    if not matched and len(jd_word) > 3:  # Lowered from 4
                        for resume_word in resume_keywords:
                            if len(resume_word) > 3:  # Lowered from 4
                                # More aggressive partial matching
                                # Match if: substring, same prefix (3+ chars), or high similarity
                                if (jd_word in resume_word or resume_word in jd_word or
                                    (len(jd_word) > 3 and len(resume_word) > 3 and jd_word[:3] == resume_word[:3]) or
                                    (len(jd_word) > 5 and len(resume_word) > 5 and jd_word[:5] == resume_word[:5])):
                                    semantic_matches += 1
                                    semantic_matched_jd_words.add(jd_word)
                                    break
                
                total_matches = len(exact_matches) + semantic_matches
                keyword_score = (total_matches / len(jd_keywords) * 100) if jd_keywords else 0
                
                # 2. CRITICAL PHRASES (25% weight) - Multi-word technical terms
                critical_phrases_jd = []
                critical_phrases_resume_text = resume_lower
                
                # Extract meaningful 2-word phrases
                jd_words = re.findall(r'\b[\w+/#-]+\b', jd_lower)
                
                for i in range(len(jd_words) - 1):
                    w1, w2 = jd_words[i].strip('/#-'), jd_words[i+1].strip('/#-')
                    if (len(w1) > 3 and len(w2) > 3 and 
                        w1 not in stopwords and w2 not in stopwords):
                        critical_phrases_jd.append(f"{w1} {w2}")
                
                # Count phrase matches
                phrase_matches = sum(1 for phrase in critical_phrases_jd if phrase in critical_phrases_resume_text)
                # More lenient phrase scoring - most resumes will have some relevant phrases
                phrase_score = (phrase_matches / len(critical_phrases_jd) * 100) if critical_phrases_jd else 60
                # Boost phrase score if we have reasonable coverage
                if phrase_score > 0:
                    phrase_score = min(phrase_score + 20, 100)  # +20 bonus for having phrases
                
                # 3. QUANTIFIABLE ACHIEVEMENTS (10% weight)
                numbers_in_resume = len(re.findall(r'\b\d+[%]?\b', text))
                achievement_score = min(numbers_in_resume * 10, 100)  # Very generous - most resumes have numbers
                
                # WEIGHTED FINAL SCORE (simplified 3-component model)
                # Real ATS systems are more lenient - focus heavily on keyword matching
                ats_score = round(
                    (keyword_score * 0.70) +      # Keywords + semantic (primary factor)
                    (phrase_score * 0.20) +       # Important phrases
                    (achievement_score * 0.10)    # Quantifiable achievements
                , 2)
                
                similarity_with_jd = ats_score
                
                # Missing keywords (excluding those with semantic matches)
                missing = jd_keywords - resume_keywords
                missing_keywords = sorted([w for w in missing if len(w) > 4], 
                                        key=lambda x: len(x), reverse=True)[:30]
                    
            except Exception as e:
                print(f"Error in ATS scoring: {e}")
                similarity_with_jd = None
                ats_score = 0
                missing_keywords = []
        else:
            # No job description provided
            missing_keywords = []

        grammar_issues = simple_grammar_check(text)
        grammar_penalty = min(len(grammar_issues) * 2, 10)  # Max 10 points penalty

        # Calculate final score as weighted average
        # Prioritize JD matching over generic skill list when JD is provided
        if job_description and job_description.strip() and similarity_with_jd is not None:
            # With JD: Heavily weight ATS and similarity (actual match to the job)
            # 15% skills + 40% similarity + 45% ATS - grammar penalty
            score = round((skill_score * 0.15) + (similarity_with_jd * 0.40) + (ats_score * 0.45) - grammar_penalty)
        else:
            # No job description: focus on skills and basic quality
            resume_quality = min(100, len(text) / 50)  # Rough quality based on content length
            score = round((skill_score * 0.70) + (resume_quality * 0.30) - grammar_penalty)
        
        score = min(max(score, 0), 100)  # Ensure score is between 0-100

        text_preview = text[:12000] + ("..." if len(text) > 12000 else "")

        result = {
            'skills_found': found_skills,
            'score': score,
            'similarity_with_jd': similarity_with_jd,
            'ats_score': round(ats_score, 2),
            'missing_keywords': missing_keywords,
            'grammar_issues': grammar_issues,
            'text_preview': text_preview
        }

        # Save to Firestore if configured
        if db:
            try:
                doc_ref = db.collection('resume_analysis').document()
                doc_ref.set({
                    'userId': user_id,
                    'timestamp': firestore.SERVER_TIMESTAMP,
                    'score': score,
                    'similarity_with_jd': similarity_with_jd,
                    'ats_score': round(ats_score, 2),
                    'missing_keywords': missing_keywords,
                    'skills_found': found_skills
                })
            except Exception as e:
                print(f"Failed to save to Firestore: {e}")

        try:
            os.remove(filepath)
        except Exception:
            pass

        return jsonify(result)
    else:
        return jsonify({'error': 'Invalid file type'}), 400

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5003))
    app.run(host='0.0.0.0', port=port)