FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y libgl1-mesa-glx

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
EXPOSE 5001 

CMD gunicorn --bind 0.0.0.0:$PORT yolo_posture_service:app