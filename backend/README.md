# Backend - IDE Inteligente de Automatización Industrial

Estructura mínima orientada a un motor REST que convierte CNL/GRAFCET en lógica Ladder.

## Componentes

- `app/main.py`: instancia de FastAPI, registra rutas del módulo GRAFCET.
- `app/api/grafcet.py`: endpoint `/api/grafcet/parse` para generar pasos y ladder.
- `app/services/*`: servicios reutilizables (parser, grafcet engine, ladder generator, mapper de variables).
- `app/models/grafcet.py`: modelos `Step` y `Transition` para exponer la estructura.

## Cómo correr

```bash
python -m uvicorn app.main:app --reload
```

Requiere el entorno creado con `pip install -r requirements.txt`.
