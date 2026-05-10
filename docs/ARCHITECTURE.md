# Vibefence — Arquitectura

Vibefence es un *trust gateway en runtime* para los agentes de IA en tu equipo
de ingeniería. Supervisa cada llamada a herramienta que un agente de IA
intenta hacer (shell, escritura de archivo, base de datos, MCP) y la gestiona
contra una política por capas que combina **procedencia** (¿de dónde viene
este plan?) con **riesgo** (¿qué tan reversible es la acción?). Cuando la
cadena de confianza se rompe — el caso típico es un README envenenado o una
página web hostil — Vibefence bloquea la llamada *antes* de que se ejecute,
con una razón literal de la cual el agente puede recuperarse.

Este documento cubre:

1. [Visión general del sistema](#1-visión-general-del-sistema) — paquetes, topología en runtime, despliegue
2. [El modelo de confianza](#2-el-modelo-de-confianza) — jerarquía de procedencia, confianza por acción, regla del shell originado en docs
3. [Defensa por capas](#3-defensa-por-capas) — L1 procedencia, L2 patrones de inyección, L3 clasificador LLM, L4 lista de patrones críticos
4. [Modelo de amenazas](#4-modelo-de-amenazas) — qué atrapamos, qué no, con citas a tests
5. [Internas de snapshot + sandbox](#5-internas-de-snapshot--sandbox) — diseño de esquema paralelo, ruta de rollback
6. [Arquitectura sólo de salida](#6-arquitectura-sólo-de-salida) — por qué tu PC no abre ningún puerto entrante

---

## 1. Visión general del sistema

Vibefence entrega tres paquetes más un esquema Postgres:

| Paquete | Lenguaje | Corre en | Propósito |
|---|---|---|---|
| `frontend/` | Next.js 16 + React 19 + Tailwind v4 | Vercel | Dashboard. UI de pareo, workspace de scan, Sentinel (feed MCP + Trust Graph + aprobaciones + snapshots), estado de runners. |
| `agent/` | Python 3.11 + Typer + FastAPI | PC del desarrollador | El gate en runtime. Aloja el motor de políticas, el servidor MCP, el comando hook, el scanner, los módulos de snapshot/sandbox. |
| `supabase/` | Migraciones SQL | Supabase Cloud | Esquema para projects, runners, scans, mcp_events, approvals, snapshots, jobs. RLS por `owner_id`. |

El agente nunca abre un puerto entrante al internet público. Habla con la
nube sólo vía heartbeats HTTPS salientes; los trabajos (correr scan, aplicar
migración, aplicar rollback) viajan de vuelta al agente *dentro del cuerpo de
respuesta* de esos heartbeats. Ver [§6](#6-arquitectura-sólo-de-salida).

### Secuencia de pareo

```mermaid
sequenceDiagram
  participant U as Usuario (navegador)
  participant V as Vercel (vibefence-black.vercel.app)
  participant S as Supabase
  participant A as Agente (PC del desarrollador)

  U->>V: POST /api/pairing/create
  V->>S: insert pairing_codes
  V-->>U: { code: "BLUE-TIGER-492" }
  Note over A: vibefence pair BLUE-TIGER-492
  A->>V: POST /api/pairing/claim
  V->>S: validar + insert runners + project_runners
  V-->>A: runner_token firmado (HMAC, TTL 1h)
  A->>V: POST /api/runners/heartbeat (cada 15 s)
  V->>S: claim queued jobs WHERE runner_id=...
  V-->>A: { pending_jobs: [...] }
```

### Ruta de decide (el bucle caliente)

```mermaid
sequenceDiagram
  participant C as Claude Code
  participant H as hook PreToolUse
  participant L as FastAPI local (127.0.0.1:7842)
  participant E as Motor de políticas
  participant V as Vercel
  participant S as Supabase

  C->>H: Bash("ls -la app/api")
  H->>L: POST /decide (tool_name, tool_input, transcript_path)
  L->>E: evaluate(...)
  E->>E: trust.build_chain (parsea transcript JSONL)
  E->>E: injection.detect en nodos doc
  E->>E: risk.assess (regex + tool baseline)
  E->>E: ¿match shell originado en doc? → BLOCK
  E->>E: confianza por acción + LLM L3 (si está activo)
  E-->>L: EngineResult { decision, reason, chain, ... }
  L-->>H: { hookSpecificOutput: { permissionDecision, reason } }
  H-->>C: deny + reason
  L->>V: POST /api/mcp-events (fire-and-forget)
  V->>S: insert mcp_events
  Note over S: Realtime → el dashboard actualiza el Trust Graph
```

### Aprobación / Snapshot / Rollback

```mermaid
sequenceDiagram
  participant C as Claude Code
  participant E as Motor
  participant L as FastAPI local
  participant Pg as Postgres (vibefence_demo)
  participant V as Vercel

  C->>E: Write("0005_drop_legacy_role.sql", "ALTER TABLE users DROP COLUMN legacy_role")
  E->>E: extrae SQL destructivo del contenido
  E-->>L: decision = SNAPSHOT_FIRST
  L->>Pg: CREATE SCHEMA vibefence_snap_<id>
  L->>Pg: CREATE TABLE ... (LIKE) + INSERT SELECT (por tabla)
  L->>Pg: CREATE SCHEMA vibefence_sandbox_<id> + corre la migración ahí
  L->>V: POST /api/snapshots + /api/approvals
  V-->>L: { snapshot_id, approval_id }
  L-->>C: deny (deny es el contrato del hook para SNAPSHOT_FIRST)
  Note over V: El usuario aprueba en el dashboard
  V->>V: insert jobs(type=apply_migration)
  L->>V: heartbeat
  V-->>L: { pending_jobs: [{ type: "apply_migration", payload: { approval_id } }] }
  L->>Pg: ALTER TABLE users DROP COLUMN legacy_role (live)
  L->>V: PATCH /api/snapshots/<id>/status → applied
  Note over V: El usuario hace rollback en el dashboard
  V->>V: insert jobs(type=apply_rollback)
  L->>Pg: ALTER TABLE users ADD COLUMN legacy_role + UPDATE FROM snap.users
  L->>V: PATCH /api/snapshots/<id>/status → rolled_back
```

Archivos críticos citados por estos diagramas:

- Emisión/verificación HMAC del token: `frontend/lib/runner-token.ts`
- Heartbeat + reclamo de jobs: `frontend/app/api/runners/heartbeat/route.ts`
- Bucle de polling saliente: `agent/vibefence/cloud_client.py:heartbeat_loop`
- Endpoint /decide: `agent/vibefence/local_api.py:/decide`
- Contrato del hook: `agent/vibefence/cli.py:decide` (lee stdin JSON, escribe hookSpecificOutput)
- Arranque de snapshot/sandbox: `agent/vibefence/local_api.py:_maybe_kickoff_snapshot_flow`

---

## 2. El modelo de confianza

La tesis: **procedencia sobre contenido.** Los escáneres de patrones leen el
texto de una llamada a herramienta y deciden si parece peligroso. Vibefence
hace una pregunta distinta — *¿quién autoró este plan?* — y gestiona la
acción contra la **fuente de menor confianza** que haya contribuido a él.

### Jerarquía de confianza

`agent/vibefence/lib/schemas/enums.py:TRUST_SCORE`:

| Tipo de fuente | Confianza |
|---|---|
| `SYSTEM_POLICY` | 100 |
| `ORG_POLICY` | 95 |
| `USER_INSTRUCTION` (mensaje tecleado por el usuario) | 85 |
| `PROJECT_POLICY` (`.vibefence.yml`) | 75 |
| `REPO_CODE` (código fuente del proyecto) | 55 |
| `TEST_FILE` | 45 |
| `DOCUMENTATION` (README, .md) | 30 → **10** si hay marcadores de inyección |
| `WEB_CONTENT`, `TOOL_OUTPUT` | 20 |
| `MODEL_PLAN` (el razonamiento del propio agente) | 10 |

`trust.build_chain` (`agent/vibefence/policy/trust.py`) recorre el transcript
JSONL reciente de Claude Code, extrae cada resultado de tool Read,
clasifica cada uno por sufijo de path, corre la detección de inyección de
Capa 2 sobre los nodos de documentación, y emite una lista de
`ProvenanceNode`.

### Confianza por acción (la idea clave)

Un sistema ingenuo de procedencia tomaría el mínimo de la cadena y bloquearía
todo a partir de él. **Eso es incorrecto** para el trabajo cotidiano: leer
un README envenenado colapsaría la confianza a 10 y bloquearía cualquier
Edit, Write o Bash subsecuente sin relación con él — incluso operaciones
normales del usuario.

Vibefence usa **confianza por acción** en su lugar
(`agent/vibefence/policy/engine.py:_per_action_trust`):

- La instrucción tecleada por el usuario (confianza 85) autoriza *acciones del usuario*.
- Un nodo de documentación sólo autoriza el *comando shell exactamente literal* que él mismo contiene (la regla del shell originado en docs, abajo).
- Las lecturas de contenido envenenado no envenenan acciones no relacionadas.

El mínimo de la cadena sigue apareciendo en el dashboard por transparencia,
pero no es el valor que gestiona la decisión. Esta es la diferencia entre un
sistema de confianza *usable* y uno que deja al agente fuera al primer
indicio de mala entrada.

### La regla del shell originado en documentación

`agent/vibefence/policy/engine.py:117-158`. Cuando se dispara una llamada
Bash:

1. Extraer cada bloque ```bash``` delimitado + cada span de backtick inline cuyo verbo sea de shell, de cada nodo documentación/web-content de la cadena.
2. Normalizar whitespace.
3. Si el comando propuesto aparece literalmente (o como substring/superset) de cualquier bloque extraído: **BLOCK con `action_summary=doc_authored_shell`**.

La superficie de la regla es la *procedencia*, no el *contenido*. Un inocuo
`ls -la app/api` queda bloqueado cuando lo autoró el README (test:
`tests/test_policy.py:test_doc_authored_innocent_ls_blocked`), sin importar
qué tan inofensivo sea el comando. Los escáneres de patrones no pueden
replicar esto — no tienen señal de procedencia a la cual atar la regla.

El texto de razón que recibe Claude (en inglés, tal como lo emite el
sistema) es un momento didáctico:

> "Documentation cannot author shell execution. The command was copied
> verbatim from README.md \[documentation, trust 30\]. Even benign shell
> commands lose their authorization when their source is a low-trust
> document — that's how prompt injection becomes tool execution."

---

## 3. Defensa por capas

El motor evalúa cuatro capas en orden. Cada una corre independientemente; el
fallo de una no salta las demás.

### Capa 1 — Procedencia (siempre activa)

`agent/vibefence/policy/trust.py` + la función de confianza por acción en
`engine.py`. Construye la cadena, etiqueta los nodos doc, aplica la regla
del shell originado en docs.

### Capa 2 — Patrones de inyección (siempre activa)

`agent/vibefence/policy/injection.py`. Conjunto de regex + limpiador de
bloque tag Unicode + detector de caracteres de ancho cero. Atrapa:

- `instruction-override` — "ignore previous instructions", "disregard prior", etc.
- `role-override` — "you are now a different".
- `fake-tag` — `<system>`, `|user|`, prefijo `SYSTEM:`.
- `imperative-execute` — "execute this:", "first run...".
- `cat-env`, `printenv`, `rm-rf` — substrings de alta señal.
- `hidden-comment`, `hidden-css` — inyección de comentario HTML / `display:none`.
- `unicode-tag-block` — `U+E0000..U+E007F`. Decodificado de vuelta a ASCII y luego re-alimentado al set de patrones para que el contenido *visible-una-vez-decodificado* también dispare.
- `zero-width` — caracteres de ancho cero stripeados + flageados.

Cuando cualquier marcador dispara sobre un nodo de documentación, la
confianza de ese nodo cae de 30 → 10. El dashboard etiqueta el nodo con
`⚠ injection markers detected`.

### Capa 3 — Clasificador de intención por LLM (apagado por defecto)

`agent/vibefence/policy/intent_llm.py`. Llama a Claude Haiku 4.5
(`claude-haiku-4-5-20251001`) con un system prompt corto y la cadena de
confianza + tool call. Veredicto: `benign` / `suspicious` / `malicious`.

- `malicious` → el motor retorna `BLOCK` sin importar la matemática de confianza.
- `suspicious` → la confianza efectiva baja en 20 (sube la barra).
- `benign` → sin cambio.

Caché LRU de 256 entradas con clave `(resumen de cadena, nombre de tool,
JSON ordenado del input)`. Hit de caché ~1 ms; miss ~400-800 ms.
**Fail-open por diseño** — si el SDK no está instalado, falta el API key, o
la llamada falla, la capa retorna None y el motor procede sin ella. Las
Capas 1, 2 y 4 siempre corren.

Habilitar con `VIBEFENCE_LLM_LAYER=1` + `ANTHROPIC_API_KEY`. Apagado por
defecto por velocidad de demo.

### Capa 4 — Lista de patrones críticos (siempre activa)

`agent/vibefence/policy/risk.py:_HIGH_RISK_PATTERNS`. Conjunto de regex
hand-curated. Cada entrada fuerza un piso de `required_trust` sin importar
lo que diga la cadena:

- Acceso a secretos (`cat .env`, `printenv`) → 95
- Filesystem destructivo (`rm -rf /`, forkbomb) → 95
- DB destructivo (`DROP TABLE`, `TRUNCATE`, `ALTER ... DROP COLUMN`, `DELETE FROM`) → 85, ruteado a través de `SNAPSHOT_FIRST`
- Privilege escalation (`UPDATE ... SET role`) → 95
- Force-push (`git push --force`) → 85
- Deploy a producción (`vercel --prod`, `terraform destroy`) → 95
- Destrucción de infraestructura (`kubectl delete`) → 95

Esto es el piso. La confianza tecleada por el usuario (85) cruza la mayoría;
nada más lo hace.

---

## 4. Modelo de amenazas

Tabla estilo STRIDE. Cada fila "atrapado" cita el test que lo prueba.

| Amenaza | Vector | Capa que la atrapa | Test |
|---|---|---|---|
| **Inyección de prompt vía README** | Repo hostil que embebe un comando shell en docs de setup | L1 shell originado en doc + L2 marcadores de inyección | `test_doc_authored_innocent_ls_blocked`, `test_poisoned_readme_drops_chain_to_10` |
| **Inyección indirecta vía contenido web** | Página web traída por el agente con `ignore previous instructions` + un snippet shell | L1 (confianza web-content 20) + L2 marcadores | `test_ignore_previous_instructions_detected` |
| **Inyección oculta por bloque tag Unicode** | Caracteres invisibles `U+E0000` en contenido no confiable que llevan instrucciones | L2 scrub-and-redetect | `test_unicode_tag_block_decoded` |
| **Exfiltración de secretos por `cat .env`** | Cualquier fuente que pida al agente leer archivos de entorno | L4 patrón crítico (required_trust 95) | `test_user_typed_cat_env_blocked_by_layer4` |
| **Migración DB destructiva** | `ALTER ... DROP COLUMN` / `DROP TABLE` hostil o accidental | L4 patrón crítico → flujo `SNAPSHOT_FIRST` | `test_destructive_db_with_user_trust_requires_snapshot`, `test_destructive_db_routed_through_approval` |
| **Bypass por escribir archivo de migración** | Agente escribe archivo `.sql` con SQL destructivo en lugar de ejecutarlo | El motor inspecciona `content`/`new_string` de Write/Edit | `test_write_destructive_sql_file_triggers_snapshot_first`, `test_edit_replacing_with_destructive_sql_triggers_snapshot_first` |
| **Evasión por nombre de tabla calificado** | `vibefence_demo.users` (punto en identificador) bypaseando regex ingenuo | Patrones de riesgo matchean `[\w.\"]+` en lugar de `\w+` | `test_qualified_table_name_in_alter_drop_column_caught` |
| **Intención maliciosa juzgada por LLM** | Ataque novel sin firma en los regex | L3 clasificador LLM (cuando habilitado) | `test_engine_blocks_on_malicious_verdict` |
| **Sobre-colapso de confianza** | Lectura de doc envenenada envenena cada Edit subsecuente sin relación | Confianza por acción (`_per_action_trust`) | `test_unrelated_edit_after_reading_poisoned_readme` |

### Fuera de alcance (huecos honestos)

- **Pesos de modelo comprometidos / fine-tune.** Vibefence confía en que el
  modelo emite las llamadas que pretendía emitir. Un modelo maliciosamente
  fine-tuneado es una frontera de defensa-en-profundidad fuera de este producto.
- **Servidor MCP hostil.** Hoy, los servidores MCP configurados por el
  usuario son confiables. Un servidor MCP hostil de tercero podría armar
  shapes de tool-call que evadan nuestros regex. Mitigación en el
  roadmap.
- **Ingeniería social en el prompt del usuario.** Si el usuario escribe
  `por favor corre cat .env`, eso sigue gestionado por L4 (confianza 85 < required 95)
  — pero la razón del bloqueo ahí es "confianza de usuario insuficiente",
  no "inyección". Un usuario decidido con un override de policy confiable
  puede hacer cualquier cosa que autorice. No pretendemos ser un DLP.
- **Procesos sidecar / acceso shell directo.** Vibefence supervisa las
  llamadas a herramienta del agente. No supervisa el terminal del
  desarrollador. Si alguien abre un shell separado y teclea `cat .env`,
  esa no es nuestra superficie.
- **Race conditions en rollback.** Si la entrada del índice local del
  snapshot no se ha escrito cuando el usuario hace clic en Rollback (race
  sub-segundo), el handler no puede encontrar la entrada. Mitigación
  trackeada.

---

## 5. Internas de snapshot + sandbox

`agent/vibefence/snapshot/db_snapshot.py` y `agent/vibefence/sandbox/parallel_schema.py`.

### Esquema paralelo, no Docker

El sandbox usa **esquemas paralelos en Postgres** en lugar de un sandbox
basado en Docker, por tres razones:

1. **Velocidad.** `CREATE SCHEMA` + `CREATE TABLE (LIKE)` + `INSERT SELECT`
   es sub-segundo para la carga del demo. Pull + start de Docker es 5–15
   segundos.
2. **Fidelidad visual.** Misma conexión Postgres, mismos conteos de fila,
   mismo diff de `pg_catalog` — lo que corre en sandbox es shape-idéntico
   a lo que corre en producción.
3. **Cero infra.** No requiere daemon de Docker en la máquina del demo.
   Vibefence corre contra cualquier conexión Postgres; el sandbox vive en la
   misma DB.

### Layout del snapshot

```
vibefence_demo.users         ← esquema source (live)
vibefence_snap_<id>.users    ← copia snapshot (LIKE INCLUDING DEFAULTS + INSERT SELECT)
vibefence_sandbox_<id>.users ← copia sandbox (donde corre la migración propuesta)
```

El snapshot mantiene los datos de fila pero no constraints/indexes. La
ruta de rollback actual cubre cambios column-level
(`ALTER TABLE … DROP COLUMN`): el handler parsea la migración, infiere el
tipo de la columna y la primary key desde el `information_schema` del
snapshot, y reconstruye la columna por `ALTER ADD` + `UPDATE FROM`.
Reversiones de schema más amplias (DROP TABLE, RENAME, etc.) están en el
roadmap.

### Ruta de rollback

`agent/vibefence/cli.py:_handle_apply_rollback` (línea 682):

1. El heartbeat retorna `{type: "apply_rollback", payload: {snapshot_id}}`.
2. `snapshot_index.find_by_remote_id(snapshot_id)` → entrada local.
3. `db_snapshot.rollback_drop_column(snap, table, column, column_type)` —
   re-agrega la columna, copia los valores de vuelta desde `snap_schema`.
4. `PATCH /api/snapshots/<id>/status` → `rolled_back`.
5. `db_snapshot.drop_snapshot(snap_schema)` — `DROP SCHEMA CASCADE`.
6. Emite evento MCP para que el feed del dashboard muestre la fila del rollback.

---

## 6. Arquitectura sólo de salida

El agente **no abre ningún puerto entrante al internet público**. PCs detrás
de NAT, detrás de firewall corporativo, detrás de router doméstico — todos
los casos comunes — funcionan sin configuración.

Cómo llegan los jobs al runner:

1. El agente corre `heartbeat_loop` cada 15 s
   (`agent/vibefence/cloud_client.py:HEARTBEAT_INTERVAL_S`).
2. Cada beat es un `POST https://<vercel>/api/runners/heartbeat` cargando
   el runner_token firmado.
3. `frontend/app/api/runners/heartbeat/route.ts:50-56` reclama atómicamente
   los jobs `queued` para el runner_id y los retorna en el cuerpo de la
   respuesta:
   ```ts
   const { data: jobs } = await svc.from("jobs")
     .update({ status: "claimed", claimed_at: now.toISOString() })
     .eq("runner_id", payload.runner_id).eq("status", "queued")
     .select("id, type, payload");
   return NextResponse.json({ ok: true, pending_jobs: jobs ?? [] });
   ```
4. `cloud_client.py:114-119` lee `resp.pending_jobs` y dispatcha cada uno a
   `cli.py:handle_job` vía `asyncio.create_task`.

La nube nunca inicia una conexión hacia el agente. La nube no puede
pinear un puerto, exfiltrar los secretos del agente, ni hacer replay
contra la FastAPI local en `127.0.0.1:7842` — el API local está bound a
localhost y sólo acepta llamadas del comando hook. Esta es la frontera de
seguridad que nos permite desplegar el dashboard como una app stateless en
Vercel sin comprometer la máquina local.

**Para CISOs**: cero exposición inbound en la máquina del desarrollador.
Compatible con NAT corporativo, ZTNA, VDI, y cualquier topología donde los
empleados no pueden recibir tráfico desde el exterior.

---

## Lectura adicional

- [`docs/POSITIONING.md`](POSITIONING.md) — estrategia de producto y go-to-market.
- [`docs/deploy.md`](deploy.md) — checklist de despliegue Vercel + Supabase.
