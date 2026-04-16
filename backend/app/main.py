from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from app.api import grafcet


app = FastAPI(
    title="IDE Inteligente de Automatización Industrial",
    version="0.1.0",
    description="API de soporte para convertir CNL y GRAFCET en lógica Ladder conectable a PLC",
)

app.include_router(grafcet.router, prefix="/api/grafcet", tags=["grafcet"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjusted for production/container
    allow_methods=["*"],
    allow_headers=["*"]
)

# Serve static files from the 'static' directory (Vite build output)
# We check if the directory exists to avoid errors during local development
if os.path.exists("static"):
    app.mount("/assets", StaticFiles(directory="static/assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # If the path looks like an API call, let FastAPI handle it (though routers take precedence)
        if full_path.startswith("api"):
            return {"error": "Not Found"}
        
        # Check if requested file exists in static folder
        file_path = os.path.join("static", full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
            
        # Default to index.html for SPA routing
        return FileResponse("static/index.html")
