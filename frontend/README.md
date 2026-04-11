# Frontend - IDE Inteligente de Automatización Industrial

Frontend estático con Vite que recrea el doble modo Texto/GRAFCET/Ladder.

## Estructura clave

- `src/index.html` y `src/main.js`: punto de entrada.
- `src/modules/`: componentes UI, canvas Konva y paneles.
- `src/styles.css`: tema oscuro tipo SCADA y diseño en grid.
- `package.json` + `vite.config.js`: scripts para `dev`/`build`.

## Cómo arrancar

```bash
cd frontend
npm install
npm run dev
```

## Próximos pasos recomendados

1. Conectar el botón "Generar GRAFCET" con `/api/grafcet/parse`.
2. Mapear estados y condiciones a Konva para hacer drag & drop.
3. Mostrar ladder dinámico y permitir exportar a OpenPLC.
