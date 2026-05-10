# Vibefence — Positioning

> Documento de estrategia público. Es la fuente de verdad para hero, README,
> deck y todo el copy. Mantenerlo corto, mantenerlo opinionado.

---

## Producto y categoría

**Vibefence — Runtime Governance for AI-Assisted Engineering.**

Una nueva categoría que vive entre tres mercados conocidos:

- **AppSec scanners** (Snyk, Veracode, Checkmarx) escanean código *antes* del commit. No ven el momento en que la IA ejecuta una llamada a herramienta.
- **DLP / data security** (Nightfall, Wiz, Cyberhaven) protegen datos en reposo y en tránsito. No saben que un agente de IA está a punto de leer `.env` por orden de un README.
- **Secret scanners** (GitGuardian, TruffleHog) atrapan secretos *después* de que se filtraron al git log. Tarde.

Vibefence supervisa el agente de IA **en runtime**: cada llamada a shell, base de datos, archivo o MCP pasa por una política de procedencia + riesgo + reversibilidad antes de ejecutarse.

---

## ICP — quién compra

**Empresas con 10–500 desarrolladores que adoptaron Claude Code, Cursor, Codex o agentes de IA equivalentes en los últimos 18 meses.**

Comprador dual:

| Persona | Qué le quita el sueño | Qué quiere ver en el demo |
|---|---|---|
| **CISO / Head of Security** | Exfiltración de secretos por inyección, ausencia de audit log para acciones de IA, compliance frente a SOC 2 / ISO 27001 cuando la IA toca datos | Identity para el agente, audit log inmutable, política de DLP funcionando en vivo |
| **VP Eng / Head of Platform** | Que la IA borre producción, que el código generado tenga IDORs que escapen al code review, que los desarrolladores adopten sin fricción | Snapshot + rollback funcionando, red-team verificando hallazgos, instalación de un solo comando |

Tamaño dulce: **Series A → C** (50–500 ingenieros). Más chico no tiene presupuesto; más grande tarda 18 meses en cerrar y ya tiene equipos internos construyendo workarounds.

---

## Tres dolores → tres pilares

### Dolor 1 — Exfiltración por inyección de prompt

> *"Mi IA tiene `.env`, kubeconfig y tokens al alcance. Un README envenenado los exfiltra."*

**Caso real**: Greshake et al. (2023), *"Not what you've signed up for: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection."* Primer paper formal que demostró que un atacante puede inyectar instrucciones a través de contenido leído por el LLM (página web, README, salida de tool). Atacaron Bing Chat, ChatGPT con plugins, GitHub Copilot Chat. La superficie es estructural — no se arregla con un escáner de prompts.

**Cómo lo resuelve Vibefence — Pilar I (MCP Trust Gateway)**: cada fuente que contribuye al plan del agente recibe un nivel de confianza explícito (USER 85, REPO 55, DOC 30 → 10 si se detectan marcadores de inyección, MODEL 10). Las acciones se gestionan por la confianza efectiva de la cadena. Un comando shell autoría de un README — incluso uno inocuo como `ls -la` — queda bloqueado porque su procedencia es de baja confianza.

### Dolor 2 — Destrucción accidental de producción

> *"La IA borró la base de datos de producción."*

**Caso real**: Replit, julio 2025. El agente de IA de Replit borró la base de datos de producción de un cliente en vivo, durante una demo pública del CEO Amjad Masad. El incidente fue ampliamente cubierto por TechCrunch, The Verge y X. Mostró públicamente lo que muchos equipos ya habían experimentado en privado.

**Cómo lo resuelve Vibefence — Pilar III (Snapshot · Sandbox · Aprobación · Rollback)**: cualquier `DROP`, `ALTER ... DROP COLUMN`, `TRUNCATE` o `DELETE FROM` se intercepta. Vibefence captura un snapshot de esquema paralelo (`vibefence_snap_<id>`), corre la migración en un sandbox (`vibefence_sandbox_<id>`), genera la diff de schema, y abre una tarjeta de aprobación en el dashboard. Aprobado se aplica; con un clic más, vuelve a su estado anterior. **Reversibilidad por defecto**.

### Dolor 3 — Código generado vulnerable

> *"El código que escribe mi IA tiene más bugs de seguridad que el humano."*

**Casos reales** (citation-grade):

- **Stanford 2022**, Perry, Srivastava, Kumar, Boneh — *"Do Users Write More Insecure Code with AI Assistants?"* Encontraron que los desarrolladores con asistente de IA escribieron código *significativamente* menos seguro que el grupo control, y además creían que su código era más seguro.
- **NYU 2023**, Pearce, Ahmad, Tan, Dolan-Gavitt, Karri — *"Asleep at the Keyboard? Assessing the Security of GitHub Copilot's Code Contributions."* ~40% de los programas generados por Copilot contenían vulnerabilidades CWE.
- **Snyk** — *State of AI Code Security 2024*. Reporte anual con datos de millones de scans.

**Cómo lo resuelve Vibefence — Pilar II (Red-Team Agéntico)**: Cartographer descubre rutas, Auth Agent hipotetiza fallas de control de acceso (IDORs, broken auth), Evidence Agent **verifica** cada hallazgo con req/resp redactado y reproducible. Cero hallazgos sin evidencia. Continuous AppSec específicamente para código generado por IA.

---

## Por qué ahora

Tres tendencias convergen en el mismo trimestre:

1. **Adopción explosiva de AI coding tools** (2024–2026). Claude Code, Cursor, Codex, Continue, Aider — penetración masiva en startups y mid-market. Las empresas que no están adoptando, lo están considerando.
2. **Cero governance dedicada**. Las organizaciones tratan a un agente de IA como si fuera otro plugin del IDE. No tiene SSO, no tiene audit log, no tiene RBAC, no tiene DLP. Sería inaceptable para un empleado humano.
3. **Incidentes públicos**. Replit (julio 2025) fue el más mediático, pero hay múltiples. La conversación pasó de "podría suceder" a "ya sucedió y volverá a suceder."

La ventana es ahora. **Vibefence es a los agentes de IA lo que CrowdStrike fue al endpoint, lo que Cloudflare fue al perímetro web.** Categoría nueva, tiempo correcto.

---

## Cómo nos vendemos

### USP — la frase única

> **"Vibefence trata a tu IA como a un empleado: con control de acceso, auditoría y reversibilidad."**

### Pitch de 30 segundos

> "Tu equipo le acaba de dar shell, base de datos y deploy a su empleado más productivo: la IA. Pero ese empleado no tiene SSO, no tiene audit log, no tiene permisos mínimos, no tiene DLP. Un README envenenado le hace exfiltrar tu `.env`. Un mal prompt le hace borrar producción. Y el código que escribe tiene más vulnerabilidades que el de un humano. Vibefence es la primera plataforma de governance en runtime para esos agentes: identity, audit, y reversibilidad para tu IA. En menos de un día tu CISO duerme tranquilo y tus desarrolladores siguen avanzando a velocidad de IA."

### Pitch de una línea

> "Identity, audit y reversibilidad para los agentes de IA en tu pipeline de ingeniería."

---

## Tono y voz

- **Hero / CTA**: punchy, corto, founder-a-comprador. *"Tu IA tiene root. Vibefence se lo quita."*
- **Product / feature pages**: medido, capability-first. *"Vibefence supervisa cada llamada a herramienta y la gestiona contra una política de procedencia, riesgo y reversibilidad."*
- **Tech docs**: riguroso, preciso. Estilo de RFC. *"El motor evalúa cuatro capas en orden, cada una independiente."*
- **Registro**: español de negocios neutro LATAM. Sin "vosotros". Sin españolismos (`vale`, `vale`, `de puta madre`). Tutear al lector (`tu IA`, `tu equipo`).
- **Términos en inglés**: mantener cuando son estándar de industria — `shell`, `MCP`, `IDOR`, `DLP`, `rollback`, `snapshot`, `runtime`, `compliance`, `audit log`, `RBAC`, `SSO`, `pipeline`, `endpoint`. Traducir cuando hay equivalente natural — *llamada a herramienta* en lugar de *tool call*, *cadena de confianza* en lugar de *trust chain*.

---

## Casos reales y referencias

| Tema | Fuente | Tipo |
|---|---|---|
| Inyección indirecta de prompts | Greshake, Abdelnabi, Mishra, Endres, Holz, Fritz (2023). *"Not what you've signed up for"*. arXiv:2302.12173 | Paper académico |
| Borrado de producción por IA | Replit AI prod-DB-delete, julio 2025. Cobertura pública en TechCrunch, The Verge, X | Incidente público |
| Inseguridad de código asistido por IA | Perry, Srivastava, Kumar, Boneh (2022). Stanford. *"Do Users Write More Insecure Code with AI Assistants?"* | Paper revisado por pares |
| Vulnerabilidades en código de Copilot | Pearce, Ahmad, Tan, Dolan-Gavitt, Karri (2023). NYU. *"Asleep at the Keyboard"* | Paper revisado por pares |
| Estado del código generado por IA | Snyk *State of AI Code Security 2024* | Reporte de industria |

> **Nota para el equipo**: confirma cada cita antes de salir a prensa. Las
> publicaciones académicas son verificables; los incidentes públicos pueden
> matizarse según evolucione la cobertura.

---

## Lo que NO somos

- **No somos un escáner de prompts**. Eso lo hace Lakera, Promptfoo, Garak — eval-time. Nosotros somos runtime.
- **No somos un escáner de secretos**. GitGuardian / TruffleHog atrapan después; nosotros impedimos antes.
- **No somos un IDE**. No competimos con Cursor / Claude Code / Codex; los **integramos**.
- **No somos un scanner de vulnerabilidades general**. Nuestro red-team es agéntico y verificado, especializado en código generado por IA. Snyk y Veracode siguen siendo necesarios para el resto del SDLC.

---

## Una plataforma, no cinco herramientas — el ángulo de venta clave

**Punto central de la venta:** los competidores son segmentados. Cada uno
cubre una tajada del problema. El comprador termina armando un Frankenstein.

| Función crítica | Vendor puntual hoy | El problema con eso |
|---|---|---|
| Prompt injection detection | Lakera Guard | API aislada; no sabe quién autorizó la acción downstream |
| Scan de código generado por IA | Snyk · Veracode | Static, no-AI-aware; escanea pero no bloquea ni revierte |
| Backup pre-migración | Lambda casera, cron interno | Hecho a mano, frágil, no se integra con el flow de aprobación |
| Audit log de tool calls | Logs propios | Cada equipo reinventa la rueda; cero estándar |
| Red-team continuo | Vendor separado o consultora | Caro, no-runtime, no se integra con los hallazgos del agente |
| DLP para `.env` y secretos | Nightfall · Cyberhaven | No sabe que la IA está a punto de leer y exfiltrar |

**Cinco contratos. Cinco APIs. Cinco dashboards. Cinco facturas.** Y la
*inyección de prompt no se correlaciona con el snapshot de DB*, el *scan de
vulnerabilidades no se correlaciona con el audit log*, el *DLP no ve cuál
fuente autorizó la acción*. El equipo de seguridad se pasa el día
correlacionando entre dashboards mientras el agente sigue ejecutando.

**Vibefence es la categoría unificada.** Una integración. Un agente local.
Un dashboard. Un audit log. Cuando la IA propone una llamada peligrosa,
los seis chequeos pasan en el mismo evento, en el mismo runtime, contra la
misma cadena de procedencia. Eso es lo que ningún competidor puede hacer —
porque ningún competidor cubre las seis dimensiones.

### Cómo decirlo en venta

- **En 1 línea**: "*Reemplazamos cinco productos puntuales con una sola
  plataforma — y los conectamos entre sí, que es lo que ninguno de ellos
  hace.*"
- **En 1 párrafo**: "*Hoy los equipos compran Lakera para inyección, Snyk
  para código, una Lambda casera para backups, logs propios para auditoría,
  y otra herramienta más para DLP. Cinco contratos, cinco dashboards, cero
  integración entre ellos. Vibefence es la primera plataforma que cubre los
  seis vectores en un solo evento de runtime: la inyección de prompt, el
  audit log, el snapshot, el sandbox, el red-team y la reversibilidad
  ocurren todos contra la misma cadena de procedencia. Un solo evento, una
  sola decisión, una sola fuente de verdad.*"
- **Para CISO**: enfatizar **audit log unificado** y **una sola integración
  con el SIEM**.
- **Para VP Eng**: enfatizar **una sola instalación** y **cero contratos
  puntuales que mantener**.

---

## Roadmap de positioning

1. Página de **comparación competitiva** dedicada (Vibefence vs Lakera vs raw hooks de Anthropic vs Cursor MCP).
2. Página de **trust** (compliance, residencia de datos, redacción).
3. **Casos de estudio** con clientes beta.
4. **Página de pricing**.
5. **Programa de partners** con proveedores de IDE.
