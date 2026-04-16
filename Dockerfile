# --- Stage 1: Build Frontend ---
FROM node:20-slim AS build-frontend
WORKDIR /app/frontend

# Copy package files and install dependencies
COPY frontend/package*.json ./
RUN npm install

# Copy source and build
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Backend & Final Image ---
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies (optional, but good practice)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
# Note: copying 'app' directory into /app/app
COPY backend/app ./app

# Copy built frontend from Stage 1 to 'static' directory
COPY --from=build-frontend /app/frontend/dist ./static

# Set Environment Variables
# Railway/Podman will use the PORT env var
ENV PORT=8080
ENV PYTHONPATH=/app

# Expose the port
EXPOSE ${PORT}

# Command to run the application using uvicorn
# We use sh -c to allow environment variable expansion for the port
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
