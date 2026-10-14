# Dockerfile pour un Space Hugging Face (SDK « Docker », matériel gratuit « CPU basic »).
# À copier À LA RACINE du Space sous le nom « Dockerfile » (voir docs/DEPLOIEMENT.md, option B).
FROM python:3.12-slim

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    CLAIRFORM_MODE=public \
    CLAIRFORM_HOST=0.0.0.0 \
    PORT=7860 \
    CLAIRFORM_DATA_DIR=/home/user/data \
    CLAIRFORM_FRAME_ANCESTORS=https://huggingface.co

WORKDIR $HOME/app
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt
COPY --chown=user backend ./backend
COPY --chown=user frontend/dist ./frontend/dist
COPY --chown=user scripts/run.py ./scripts/run.py
RUN mkdir -p $HOME/data

EXPOSE 7860
CMD ["python", "scripts/run.py"]
