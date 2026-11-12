FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      tesseract-ocr tesseract-ocr-deu tesseract-ocr-eng libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Erst torch aus dem CPU-Index, sonst zieht pip die CUDA-Räder (mehrere GB).
RUN pip install --no-cache-dir torch==2.15.0 torchvision==0.29.2 --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

ENV HF_HOME=/modelle/hf \
    CUDA_VISIBLE_DEVICES="" \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY server.py /app/server.py
EXPOSE 8100
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8100", "--workers", "1"]
