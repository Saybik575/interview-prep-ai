from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv
load_dotenv()
from werkzeug.utils import secure_filename
import docx2txt
from pdfminer.high_level import extract_text
import json
import language_tool_python
from google.cloud import firestore

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

tool = language_tool_python.LanguageTool('en-US')
db = firestore.Client()

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/resume/history', methods=['GET'])
def get_resume_history():
    user_id = request.args.get('userId', 'demoUser')
    docs = db.collection('resume_analysis').where('userId', '==', user_id).order_by('timestamp', direction=firestore.Query.DESCENDING).limit(20).stream()
    history = []
    for doc in docs:
        data = doc.to_dict()
        history.append({
            'docId': doc.id,
            'timestamp': data.get('timestamp'),
            'score': data.get('score'),
            'similarity_with_jd': data.get('similarity_with_jd'),
            'ats_score': data.get('ats_score')
        })
    print(f"History API: Returned {len(history)} records for userId={user_id}")
    return jsonify(history)

@app.route('/resume/history/delete', methods=['POST'])
def delete_resume_history():
    try:
        data = request.json
        doc_id = data.get('docId')
        user_id = data.get('userId')

        if not doc_id:
            return jsonify({'error': 'docId is missing'}), 400

        doc_ref = db.collection('resume_analysis').document(doc_id)
        doc = doc_ref.get()

        if not doc.exists:
            return jsonify({'error': 'Document not found'}), 404

        doc_ref.delete()
        print(f"History API: Deleted document {doc_id} for userId={user_id}")
        return jsonify({'message': 'Document deleted successfully'}), 200
    except Exception as e:
        print(f"Error in delete_resume_history: {e}")
        return jsonify({'error': 'Failed to delete history entry.', 'details': str(e)}), 500

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
        try:
            total_skills = len(SKILLS) if SKILLS else 0
            if total_skills > 0:
                skill_score = round(len(found_skills) / total_skills * 100)
            else:
                skill_score = 0
            score = min(max(skill_score, 0), 100)
        except Exception:
            score = 0

        similarity_with_jd = None
        if job_description and job_description.strip():
            # Simple keyword matching (replaces sentence-transformers for memory efficiency)
            try:
                jd_words_lower = set([w.lower().strip('.,:;()[]{}"\'') for w in job_description.split() if len(w) > 3])
                resume_words_lower = set([w.lower().strip('.,:;()[]{}"\'') for w in text.split() if len(w) > 3])
                common_words = jd_words_lower & resume_words_lower
                if jd_words_lower:
                    similarity_with_jd = round((len(common_words) / len(jd_words_lower)) * 100, 2)
                else:
                    similarity_with_jd = 0.0
            except Exception:
                similarity_with_jd = None

        jd_keywords = set([w.lower().strip('.,:;()[]{}"\'') for w in job_description.split() if len(w) > 2])
        resume_words = set([w.lower().strip('.,:;()[]{}"\'') for w in text.split() if len(w) > 2])
        present_keywords = jd_keywords & resume_words
        missing_keywords = list(jd_keywords - resume_words)
        ats_score = (len(present_keywords) / len(jd_keywords) * 100) if jd_keywords else 0

        matches = tool.check(text)
        grammar_issues = []
        max_issues = 8
        for m in matches[:max_issues]:
            try:
                replacements = m.replacements if hasattr(m, 'replacements') else []
                try:
                    start = max(0, int(m.offset) - 40)
                    err_len = int(getattr(m, 'errorLength', 0) or 0)
                    end = int(m.offset) + err_len + 40
                    snippet = text[start:end].replace('\n', ' ')
                except Exception:
                    snippet = (text[:200] + '...') if len(text) > 200 else text
                grammar_issues.append({
                    'message': getattr(m, 'message', str(m)),
                    'suggestions': replacements[:3],
                    'context': snippet,
                    'offset': int(getattr(m, 'offset', -1)),
                    'length': int(getattr(m, 'errorLength', 0) or 0)
                })
            except Exception:
                grammar_issues.append({'message': str(m), 'suggestions': [], 'context': ''})

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
        except Exception:
            pass

        try:
            os.remove(filepath)
        except Exception:
            pass

        return jsonify(result)
    else:
        return jsonify({'error': 'Invalid file type'}), 400

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)