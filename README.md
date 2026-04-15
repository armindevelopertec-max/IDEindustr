# Compilador Industrial IDE 🚀

<div align="center">
  <a href="https://www.facebook.com/reel/2184463032089020" target="_blank">
    <img src="https://img.shields.io/badge/VER_DEMO_EN_VÍDEO-Click_Aquí-blue?style=for-the-badge&logo=facebook&logoColor=white" alt="Demo en Video">
  </a>
</div>

---

Un entorno de desarrollo integrado (IDE) moderno para la automatización industrial, diseñado para programar, visualizar y emular lógica **GRAFCET** mediante un lenguaje de alto nivel llamado **CNL (Compiler Network Logic)**.

![Versión](https://img.shields.io/badge/version-1.0.0--MVP-blue)
![Estado](https://img.shields.io/badge/estado-funcional-success)

## ✨ Características Principales

- **Editor CNL Inteligente:** Programación secuencial mediante texto con resaltado de sintaxis y detección de errores en tiempo real.
- **Visualizador GRAFCET Dinámico:** Generación automática del diagrama GRAFCET (Nivel 1 y Nivel 2) a partir del código.
- **Motor de Emulación Industrial:**
  - Simulación de pasos, transiciones y acciones.
  - Soporte para **Contadores** con incremento en bucles.
  - Acciones de **Enclavamiento (Set/Reset)** mediante `+` y `-`.
  - Temporizadores industriales (`t0=5s`) y de paso (`Sn.T`).
  - Pausas de visualización de 2 segundos para monitoreo de procesos.
- **Generación de Lógica Ladder:** Conversión automática a diagramas de contactos listos para PLC.
- **Persistencia de Diseño:** El IDE guarda automáticamente la posición de tus bloques y líneas.

## 🛠️ Arquitectura del Proyecto

El proyecto está dividido en dos grandes bloques:

- **Frontend (Vite + Konva.js):** Interfaz de usuario interactiva, motor de dibujo vectorial y emulador en tiempo real ejecutado en el cliente.
- **Backend (FastAPI + Python):** API de procesamiento lógico para la compilación avanzada y exportación de estructuras.

## 🚀 Instalación y Ejecución

### Requisitos Previos
- Node.js (v18+)
- Python (3.9+)

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # En Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

## 📝 Sintaxis del Lenguaje CNL

El lenguaje **CNL** permite definir secuencias industriales de forma natural:

```cnl
S0 NEXT OM, SI -> S1           // Transición simple con AND (coma)
S1 THEN MOTOR+ NEXT 5s -> S2   // Enclavamiento y temporizador de paso
S2 THEN CONT1=30 NEXT CONT1 -> S3 // Contador incremental (30 ciclos)
S2 NEXT NOT CONT1 -> S1        // Bucle de retorno
S3 THEN MOTOR- NEXT 1 -> S0    // Reset de salida y retorno a inicio
```

## 📐 Estructura de Archivos

```text
├── frontend/           # Interfaz y motor de emulación JS
│   ├── src/modules/    # Lógica modular (canvas, emulador, model)
│   └── public/         # Activos estáticos
├── backend/            # API de procesamiento en Python
│   ├── app/api/        # Endpoints de la API
│   └── app/services/   # Motores de conversión y lógica
└── docs/               # Documentación técnica y estándares
```

## 🤝 Contribuciones

Este es un proyecto enfocado en la mejora de la productividad en la automatización industrial. Las sugerencias sobre flancos de subida, detección de colisiones lógicas y nuevos drivers de exportación son bienvenidas.

---
Desarrollado con ❤️ para la ingeniería industrial.
