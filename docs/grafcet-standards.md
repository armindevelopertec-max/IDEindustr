# GRAFCET Industrial Standards

## 1. Lógica (IEC-GRAFCET)

1. Un GRAFCET se compone de etapas (pasos), transiciones y acciones; el modelo interno es la única fuente de verdad.
2. Puede haber múltiples etapas activas simultáneamente: se admiten paralelismos (AND split) y sincronizaciones (AND join).
3. Una transición se dispara únicamente si la etapa fuente está activa **y** su condición es verdadera.
4. Al dispararse una transición se desactiva la etapa origen y se activa la etapa destino correspondiente.
5. Las acciones se ejecutan mientras la etapa asociada permanezca activa (modo continuo); las variantes impulsivas, memorizadas o de liberación quedan para capas avanzadas.
6. Las transiciones concurrentes deben resolverse en el modelo sin ambigüedad o mediante una prioridad declarada; nunca se rely en el layout visual para decidir.
7. El layout (prompt o canvas) es solo una representación sincronizada del modelo y no afecta la ejecución real del sistema.

## 2. Estilos UI / UX industrial

1. Fondo principal profundo con degradados y gradients sútiles refuerza la estética SCADA.
2. Paneles translúcidos con bordes suaves y sombreado proyectan jerarquía de niveles (paneles < nodos < acciones).
3. El canvas incluye grid y overlay para guiar la distribución sin perder legibilidad; se mantuvo la política “no cruces sobre nodos”.
4. Estados semánticos:
   * Etapa activa → borde verde brillante (`.grafcet-node-active`).
   * Etapa inactiva → borde azul tenue (`.grafcet-node-inactive`).
   * Transición activa o destacada → línea más gruesa verde (`.grafcet-transition-highlight`).
5. Tipografía monoespaciada con pesos (labels con `.grafcet-node-label`) y espacios consistentes mejora lectura en bloques lógicos.
6. Colores semánticos de salida y error (`--highlight-yellow`, `--transition-base`) deben adoptarse en futuras animaciones o alertas.

Este documento complementa las decisiones de diseño dentro del proyecto y sirve como referencia para futuras iteraciones de lógica o UI.
