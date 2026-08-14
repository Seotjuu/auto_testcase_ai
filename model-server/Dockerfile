FROM python:3.11-slim

WORKDIR /app

# llama-cpp-python은 Linux에서 소스 빌드되므로 build-essential/cmake가 필요하다.
RUN apt-get update && apt-get install -y --no-install-recommends build-essential cmake \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

ENV HF_HOME=/app/.cache/huggingface

EXPOSE 7860

# Railway 등 PaaS는 $PORT 환경변수로 리슨 포트를 지정한다. 로컬/HF Spaces처럼
# PORT가 없으면 7860으로 기본 동작한다.
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}
