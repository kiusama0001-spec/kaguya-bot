# Kaguya — entrega de correcciones finales

## Estado general

**NO LISTO PARA PRODUCCIÓN.** Esta entrega corrige una contradicción del validador y agrega una prueba de regresión, pero no debe interpretarse como una aprobación editorial del corpus ni como una compilación de producción verificada.

## Corpus de frases

| Métrica | Antes | Después |
|---|---:|---:|
| Entradas totales | 10,000 | 10,000 |
| Cuotas por categoría | Cumplidas | Cumplidas |
| Frases de Kiwbot conservadas | 754 | 754 |
| Frases creadas para Kaguya | 9,246 | 9,246 |
| Duplicados exactos normalizados | 0 | 0 |
| Duplicados aproximados detectados | 0 | 0 |
| Entradas inválidas | 0 | 0 |
| Fragmentos repetidos | 1,997 | 1,997 |
| Apariciones repetidas de esos fragmentos | 12,012 | 12,012 |
| Estado editorial | NOT READY | NOT READY |

El detector `auditRepeatedClauses()` divide el texto por `; . ! ? ¿ ¡ :`, normaliza cada fragmento mediante `normalizePhrase()`, ignora puntuación/símbolos, nombres y vocativos incluidos en su lista, elimina algunos iniciadores comunes y considera fragmentos de siete palabras o más. Cuenta cada fragmento normalizado que aparece en más de una entrada y suma las apariciones posteriores a la primera.

Los ejemplos más frecuentes incluyen “no todo se resuelve a fuerza de voluntad” (67 entradas), “tuviera que apostar por tu mejor decisión sería esta” (67), “ni una ni su creador ganan discutiendo con los hechos” (67), “la diferencia entre juego consensuado y daño está en los límites” (56), y múltiples instrucciones operativas repetidas 40–46 veces en moderación, Pokédex y GIFs.

**No se reescribió el corpus editorial en esta entrega.** Hacerlo requiere revisión y redacción sustantiva de miles de entradas; sustituir fragmentos por sinónimos o eliminar los fragmentos repetidos no satisfaría el requisito. Las cuotas se conservan, pero la calidad editorial sigue bloqueada.

### Corrección del validador

Anteriormente, el campo global `ready` podía ser `true` aunque `editorialReady` fuera `false`. Ahora `ready` también requiere `clauseAudit.editorialReady`, de modo que el importador no pueda tratar el corpus actual como aprobado. Se añadió una prueba de regresión que comprueba la señal de repetición real y que readiness permanezca bloqueado.

## Pruebas

- `node --test test/*.test.mjs`: **168 aprobadas, 0 fallidas, 0 omitidas**.
- Validación del corpus: 10,000 entradas, cuotas exactas, 0 duplicados exactos, 0 aproximados, 0 inválidas, pero `ready=false` por repetición editorial.
- Revisión estructural básica de `render.yaml`: pasó comprobación textual de estructura; no se dispuso de un parser YAML.

## Instalación, typecheck y build

La instalación congelada no pudo comenzar porque Corepack intentó descargar `pnpm@10.8.1` desde `https://registry.npmjs.org/pnpm/-/pnpm-10.8.1.tgz` y DNS devolvió `EAI_AGAIN` para `registry.npmjs.org` (`getaddrinfo`, errno `-3001`).

Por tanto:
- Instalación congelada: **bloqueada por DNS**.
- Typecheck semántico completo: **no verificado**; no se pudo invocar pnpm ni instalar dependencias.
- Compilación de producción: **no verificada** por el mismo bloqueo.
- Migraciones contra PostgreSQL real: **no verificadas**.
- Despliegue Render: **no ejecutado**.

Registro completo: `verification-results/final-verification.log`.

## Integraciones reales

No se probaron contra credenciales ni servicios vivos Telegram, Clerk, PostgreSQL, Groq, PokéAPI, Brave Search, ElevenLabs o Render. Las pruebas automatizadas actuales incluyen comprobaciones unitarias/estáticas y simuladas; no son evidencia de integración en producción.

## Archivos modificados en esta entrega

- `scripts/validate-phrase-corpus.mjs`: readiness ahora incorpora el resultado editorial.
- `test/phrase-corpus.test.mjs`: prueba de regresión del estado NOT READY en el corpus real.
- `data/phrase-corpus-report.json`: reporte completo actualizado.
- `verification-results/phrase-validation-summary.json`: resumen y patrones más frecuentes.
- `verification-results/final-verification.log`: comandos y bloqueo de instalación/build.
- `TEST-RESULTS.txt`: resumen honesto de pruebas y pendientes.

El código y módulos restantes del proyecto se conservaron.
