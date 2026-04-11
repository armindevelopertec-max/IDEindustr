from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import grafcet


app = FastAPI(
    title="IDE Inteligente de Automatización Industrial",
    version="0.1.0",
    description="API de soporte para convertir CNL y GRAFCET en lógica Ladder conectable a PLC",
)

app.include_router(grafcet.router, prefix="/api/grafcet", tags=["grafcet"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"]
)
