FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

ENV PADDLE_PDX_CACHE_HOME=/modelle/paddlex \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True \
    CUDA_VISIBLE_DEVICES="" \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY server.py /app/server.py
EXPOSE 8100
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8100", "--workers", "1"]
