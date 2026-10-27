# Kaguya — estado de implementación

## Implementado en el código fuente

- Entrada real de servidor en `artifacts/api-server/src/index.ts`, cierre ordenado, sondeo Telegram con bloqueo/cursor persistente y health check.
- Autenticación Clerk con allowlist de administradores y rechazo por defecto cuando faltan claves o autorización.
- Moderación con permisos previos, estados intermedios recuperables, silencios temporales y `can_react_to_messages`.
- Ajustes de grupo conectados a filtros/excepciones, bienvenida/despedida, plantillas y anti-flood de texto distribuido por PostgreSQL.
- Groq conversacional, memoria separada por chat/usuario, toggle de IA, alternativa local y presupuestos persistentes para chat, visión, transcripción, TTS y wiki.
- PokéAPI con timeout/caché: ficha, evolución, movimientos, objetos, tipo, efectividad, debilidades/resistencias y sugerencias de cobertura.
- Wiki web con Brave cuando hay clave, fallback de búsqueda/resumen de Wikipedia en español, fuentes/enlaces y lista local de documentación oficial.
- Clientes, importes en centavos, pagos parciales, historial y claves de idempotencia; facturas mensuales y notificaciones con worker persistente.
- Recordatorios persistentes, límites y reintentos; un envío ambiguo no se repite automáticamente y necesita revisión administrativa.
- Eventos recurrentes y concursos con inscripción única, compromiso previo de semilla SHA-256, padrón ordenado, hash y algoritmo de sorteo reproducible.
- Panel con gestión de grupos, sanciones, plantillas, filtros, frases, GIFs, recordatorios, clientes/pagos, eventos, actividad y respaldo/restauración aditiva.
- Importador idempotente de frases, corpus de 10,000 registros con los objetivos de categorías y búsqueda/paginación server-side en el panel.
- Migraciones aditivas, render Blueprint y configuración de variables documentadas.

## Validación técnica pendiente / bloqueada

- pnpm 10.8.1 no se pudo descargar del registro npm por error de red DNS; `pnpm install --frozen-lockfile` no pudo arrancar.
- `tsc --build --pretty false` no puede completar debido a dependencias ausentes. La transpilación sintáctica TS/TSX no equivale a typecheck ni build de producción.
- No se ejecutaron conexiones reales a PostgreSQL/Telegram/Clerk/Groq/ElevenLabs ni despliegue Render.

## Calidad editorial del corpus

La estructura numérica cumple 10,000 y los 11 objetivos; el validador encuentra cero frases completas duplicadas tras normalización y cero pares aproximados con su umbral actual. **La auditoría de cláusulas detecta 1,997 fragmentos largos repetidos en 12,012 apariciones, por lo que `editorialReady=false`.** El requisito de evitar plantillas repetidas no puede darse por cumplido hasta revisar y reescribir ese material. El informe completo y ejemplos están en `DELIVERY-REPORT.md` y `data/phrase-corpus-report.json`.

## Antes de producción

1. Instalar dependencias con Node 22.16.x y pnpm 10.8.1 en una máquina con acceso a npm.
2. Ejecutar typecheck, build y tests; corregir los errores que aparezcan con dependencias reales.
3. Completar la revisión editorial del repertorio antes de declarar la meta de frases terminada.
4. Configurar secretos solo en local/Render, ejecutar migraciones y probar en grupo privado con permisos restringidos.
5. Verificar en vivo login Clerk, delivery Telegram, proveedores, recordatorios, rentas, respaldos y restauración.

## Registros de verificación

Las salidas reproducibles de instalación, DNS, intento de typecheck, sintaxis y pruebas quedan en `verification-results/`.
