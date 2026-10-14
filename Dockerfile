# ClairForm — image de production (mode « public » : un espace privé par navigateur)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CLAIRFORM_MODE=public \
    CLAIRFORM_HOST=0.0.0.0 \
    CLAIRFORM_DATA_DIR=/data \
    PORT=8000

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY frontend/dist ./frontend/dist
COPY scripts/run.py ./scripts/run.py

# Utilisateur non privilégié ; /data doit être monté sur un disque persistant.
RUN useradd --create-home --uid 10001 clairform && mkdir -p /data && chown -R clairform /data /app
USER clairform
VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/api/health' % os.environ.get('PORT','8000'), timeout=4)"

CMD ["python", "scripts/run.py"]
