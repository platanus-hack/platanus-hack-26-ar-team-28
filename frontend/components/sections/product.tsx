"use client";

import { Pill } from "@/components/pill";
import { PillarVisual } from "@/components/pillar-illustrations";
import { Reveal } from "@/components/reveal";
import { Shield, Radar, RotateCcw } from "lucide-react";

const pillars = [
  {
    icon: Shield,
    pill: "PILAR 01",
    title: "Identity y DLP para tu IA",
    subtitle: "Para tu CISO — runtime governance del agente",
    description: "Vibefence se interpone entre tus agentes de IA y las herramientas que usan. Cada llamada se verifica contra una cadena de procedencia explícita antes de ejecutarse. Reemplaza Lakera Guard + GitGuardian + DLP de Nightfall en una sola plataforma.",
    features: [
      "Bloquea exfiltración de .env, kubeconfig y secretos por READMEs envenenados",
      "Detección de inyección por capas: regex + Unicode tag-block + LLM intent (opcional)",
      "Audit log inmutable de cada llamada a herramienta — listo para SIEM",
      "Sólo de salida: cero puerto entrante en la máquina del desarrollador",
    ],
    diagram: `Claude Code / Cursor
     ↓
Vibefence Tool Audit Layer
     ↓
Shell / Git / Database / Deploy`,
  },
  {
    icon: Radar,
    pill: "PILAR 02",
    title: "AppSec continuo para código generado por IA",
    subtitle: "Para tu VP Eng — red-team agéntico verificado",
    description: "El código que escribe tu IA tiene 40% más vulnerabilidades (NYU 2023). Tu code review humano no escala. Vibefence lanza agentes especializados que descubren, hipotetizan y verifican cada hallazgo con evidencia reproducible. Reemplaza un retainer de pentest manual + scanners no-AI-aware.",
    features: [
      "Cartographer mapea rutas, APIs y flujos de autenticación",
      "Auth Agent prueba límites de roles, ownership e IDORs",
      "Evidence Agent verifica cada hallazgo con req/resp redactado",
      "Cero falsos positivos sin evidencia — listo para JIRA/Linear",
    ],
    diagram: `Dashboard
     ↕
Agentes locales
     ↕
App / Repo / Database`,
  },
  {
    icon: RotateCcw,
    pill: "PILAR 03",
    title: "Reversibilidad de un solo clic",
    subtitle: "Para tu VP Eng — el incidente Replit no se repite",
    description: "Replit, julio 2025: la IA borró producción. Vibefence intercepta toda migración destructiva, captura un snapshot de esquema paralelo, ejecuta la migración en sandbox primero, y abre una tarjeta de aprobación. Aprobado se aplica; un clic más y vuelve atrás. Reemplaza Lambdas caseras + crons internos.",
    features: [
      "Snapshot paralelo de Postgres en sub-segundo (no Docker)",
      "Sandbox con diff de schema y conteo de filas afectadas",
      "Tarjeta de aprobación interactiva en el dashboard",
      "Rollback de un solo clic a estado pre-migración",
    ],
    diagram: `IA propone cambio destructivo
     ↓
Snapshot → Sandbox → Aprobación
     ↓
Aplicar  ↺  Rollback`,
  },
];

export function ProductSection() {
  return (
    <section id="producto" className="py-24 md:py-32 relative bg-background bg-circuit bg-scanlines">
      {/* Diagonal accent lines */}
      <div className="absolute inset-0 bg-diagonal pointer-events-none" />
      
      <div className="container relative z-10">
        <div className="max-w-3xl mx-auto text-center mb-20">
          <Reveal delay={20}>
            <Pill className="mb-6">EL PRODUCTO</Pill>
          </Reveal>
          <Reveal
            as="h2"
            delay={100}
            className="text-3xl sm:text-4xl md:text-5xl font-sans font-semibold mb-6 tracking-tight"
          >
            Una plataforma. <span className="text-primary">Cero herramientas puntuales.</span>
          </Reveal>
          <Reveal
            as="p"
            delay={180}
            className="font-mono text-foreground/60 text-sm sm:text-base"
          >
            Hoy los equipos compran Lakera para inyección, Snyk para código, Lambdas caseras para backups, logs propios para auditoría, y otra herramienta más para DLP. Cinco contratos, cinco dashboards, cero integración. Vibefence cubre los seis vectores en un solo evento de runtime, contra la misma cadena de procedencia.
          </Reveal>
        </div>

        <div className="space-y-16 md:space-y-24">
          {pillars.map((pillar, i) => (
            <div
              key={i}
              className={`grid lg:grid-cols-2 gap-8 lg:gap-16 items-center ${
                i % 2 === 1 ? "lg:flex-row-reverse" : ""
              }`}
            >
              <Reveal className={i % 2 === 1 ? "lg:order-2" : ""} delay={80 + i * 80}>
                <Pill className="mb-4">{pillar.pill}</Pill>
                <h3 className="text-2xl sm:text-3xl font-sans font-medium mb-2 tracking-tight">
                  {pillar.title}
                </h3>
                <p className="text-primary font-mono text-sm mb-4">
                  {pillar.subtitle}
                </p>
                <p className="font-mono text-foreground/60 text-sm leading-relaxed mb-6">
                  {pillar.description}
                </p>
                <ul className="space-y-3">
                  {pillar.features.map((feature, j) => (
                    <li
                      key={j}
                      className="flex items-start gap-3 font-mono text-sm text-foreground/80"
                    >
                      <span className="text-primary mt-1">+</span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Reveal className={i % 2 === 1 ? "lg:order-1" : ""} delay={140 + i * 80}>
                <div
                  className="border border-border bg-background/60 backdrop-blur-sm p-6 md:p-8 relative overflow-hidden group hover:border-primary/30 transition-colors duration-300"
                  style={{
                    clipPath: "polygon(16px 0, calc(100% - 16px) 0, 100% 16px, 100% calc(100% - 16px), calc(100% - 16px) 100%, 16px 100%, 0 calc(100% - 16px), 0 16px)",
                  }}
                >
                  {/* Corner accents */}
                  <div className="absolute top-0 left-0 w-4 h-4 border-l-2 border-t-2 border-primary/40" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-r-2 border-t-2 border-primary/40" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-l-2 border-b-2 border-primary/40" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-r-2 border-b-2 border-primary/40" />
                  
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
                      <pillar.icon className="w-5 h-5 text-primary" />
                    </div>
                    <span className="font-mono text-xs text-foreground/40 uppercase tracking-wider">
                      Arquitectura
                    </span>
                  </div>
                  <PillarVisual index={i} />
                </div>
              </Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
