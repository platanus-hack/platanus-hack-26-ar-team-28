# Vibefence

> **Tu IA tiene root. Vibefence se lo quita.**

## El problema

Los agentes de IA — Claude Code, Cursor, Codex — ya tienen las llaves de tu
máquina: shells, bases de datos, deploys. **También leen READMEs, páginas
web y output de terminal**, y por defecto todo eso vive en el mismo nivel
de confianza. Una línea envenenada en un README puede convertirse en un
`cat .env` ejecutado contra producción. Un agente que escribe código con
40% más vulnerabilidades que un humano (NYU, 2023) merge sin que tu
code-review humano escale. Una migración destructiva como la que tiró
Replit en julio 2025 (eliminación accidental de una base de datos en
producción) borra trabajo real.

Hoy hay tres categorías de productos atacando estos problemas por
separado: gateways MCP / hooks de runtime, scanners de seguridad para
código generado por IA, y herramientas de snapshot/rollback. La realidad
es que **necesitás los tres a la vez** — y tenerlos integrados, no
pegados con cinta.

## La solución: tres pilares, una plataforma

**Vibefence integra los tres en un solo producto.** Esto es la
diferenciación clave: la mayoría de competidores construyen uno de los
tres pilares; nosotros entregamos los tres con un único agente local, un
único dashboard y una única política compartida.

---

### Pilar I — Tool Audit Layer

**Procedencia sobre contenido.** Cada llamada a herramienta de Claude
Code, Cursor o cualquier IDE compatible (Bash, Edit, Write, MultiEdit,
mcp__\*) pasa por un hook PreToolUse que reenvía la decisión a una
FastAPI local en `127.0.0.1:7842`. El motor de políticas evalúa la
**cadena de procedencia** (qué fuente autorizó esta acción: usuario,
documentación, output de tool, plan del modelo) y aplica el principio:
**la documentación no puede autorizar la ejecución de un shell**.

Si un comando aparece copiado verbatim de un README contaminado, se
bloquea — incluso si es benigno como `ls`. La razón: el peligro no es el
comando, es la fuente. Esto neutraliza la categoría más común de
prompt-injection contra agentes de IA.

**Tecnología:** PreToolUse hooks de Claude Code, MCP server para Cursor,
motor de trust + risk scoring (~700 LOC Python), Layer 4 de patrones
hard-coded para acciones críticas (secret access, destructive DB, force
push, prod deploy).

**Visible en el dashboard:** Tool Audit Feed en tiempo real con cada
decisión, Trust Graph que anima la cadena de procedencia, y razón
estructurada para forensics.

---

### Pilar II — Red-team agéntico

**Cero falsos positivos.** Tres agentes especializados corren en paralelo
contra tu app local:

- **Cartographer** mapea rutas, APIs y flujos de auth a partir del repo
  (ripgrep sobre `app/api/**/route.ts` para Next.js App Router).
- **Auth Agent** prueba acceso cruzado entre tenants — autentica como
  user_a y user_b, enumera objetos visibles a cada uno, y prueba si
  user_a puede acceder a recursos de user_b. Genera hipótesis (200
  response + target_id en el body = sospecha de IDOR).
- **Evidence Agent** verifica cada hipótesis re-ejecutando la request
  con redacción aplicada y rechaza cualquier finding que no se reproduzca
  en un segundo intento. Solo lo verificable llega al dashboard.

Sin ruido. Sin "100 críticos sin contexto". Cada finding viene con
request/response redactado, ruta afectada, archivo afectado, y resumen
de remediación — listo para JIRA o Linear.

**Tecnología:** orquestador async en Python (~400 LOC), httpx para las
probes, redacción a nivel de body antes de subir a la nube.

---

### Pilar III — Snapshot, Sandbox y Aprobación

**Reversibilidad por defecto.** Cuando un agente intenta una operación
destructiva (DROP TABLE, ALTER TABLE DROP COLUMN, TRUNCATE, DELETE FROM,
git push --force, vercel --prod, terraform destroy, kubectl delete),
Vibefence:

1. **Captura un snapshot** — copia paralela del schema de Postgres en
   `vibefence_snap_<id>`. CREATE TABLE AS SELECT para minimizar
   round-trips. Operación concurrente con el sandbox para que no se
   acumulen latencias.
2. **Corre la migración en sandbox** — schema paralelo aislado, diff de
   `information_schema.columns` antes y después, tests pasados en cascada
   en el dashboard.
3. **Postea una tarjeta de aprobación** — el dashboard recibe la
   propuesta, muestra el diff lado a lado, el snapshot referenciado, y
   los botones [Aprobar] [Denegar] [Rollback].
4. **Aplica solo después de aprobación humana** — y aún después de
   aplicar, **rollback en un click**: replaying del snapshot contra el
   schema vivo, animación de pipeline (Dashboard → Cloud → Runner →
   Database), confirmación visual.

Replit, julio 2025, no se repite.

**Tecnología:** parallel-schema snapshot en Postgres (~200 LOC), motor
de sandbox con diff de schema (~150 LOC), Supabase Realtime para
notificación bidireccional dashboard ↔ runner, animación de pipeline
en React/Framer Motion.

---

## Por qué los tres juntos

Comprar tres productos diferentes para cubrir estos pilares fragmenta
la auditoría: cada uno tiene su propio audit log, sus propias
identidades, sus propios criterios de "qué es destructivo". Vibefence
opera con un modelo unificado:

- **Una sola noción de identidad** (runner pareado con identidad por
  máquina, no por persona).
- **Un solo audit log** que correlaciona scans, decisiones de runtime y
  approvals.
- **Una sola política** — los mismos patrones que detectan
  `destructive_database` en runtime también informan al red-team sobre
  qué probar.

Eso es lo que permite contar el incidente de Replit como una historia
completa: el agente leyó algo, intentó algo destructivo, fue
identificado, fue gateado por humano, fue revertido. **Cuatro pilares
de control en un solo gesto del usuario.**

---

## Stack técnico

- **Agente local (Python):** Typer CLI, FastAPI, psycopg, httpx,
  Pydantic. ~3500 LOC. Distribuido vía un instalador one-liner desde
  `vibefence-black.vercel.app/install.ps1` (Windows) o `install.sh`
  (Unix). Idempotente, install dir aislado en `~/.vibefence/agent`.
- **Dashboard (Next.js 16 + React 19):** Server Components, Supabase
  Realtime para los feeds en vivo, Tailwind v4, Framer Motion.
  Desplegado en Vercel.
- **Backend (Supabase):** Postgres con migraciones versionadas, Row
  Level Security para multi-tenancy, Realtime para sincronización
  cliente ↔ runner.
- **Demo app vulnerable (VibeCRM):** Next.js + Drizzle ORM, IDOR
  intencional en `/api/projects/[id]`, tres usuarios sembrados.

## Cómo probarlo

**Dashboard:** <https://vibefence-black.vercel.app>

**Instalación local del agente** (una línea):

```bash
# Windows
irm https://vibefence-black.vercel.app/install.ps1 | iex

# macOS / Linux
curl -fsSL https://vibefence-black.vercel.app/install.sh | sh
```

Requiere Python 3.11+. Después de instalar:

```bash
vibefence pair <CODE>     # código generado en el dashboard
vibefence start           # agente corriendo en 127.0.0.1:7842
```

Listo — abrí Claude Code o Cursor y cada llamada a herramienta queda
supervisada.

## Repo

<https://github.com/platanus-hack/platanus-hack-26-ar-team-28>
