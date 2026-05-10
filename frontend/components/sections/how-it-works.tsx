"use client";

import { Pill } from "@/components/pill";
import { Reveal } from "@/components/reveal";
import { SecurityIllustration } from "@/components/security-illustration";

const steps = [
  {
    step: "01",
    title: "Instala el agente",
    description: "Un solo comando. Conecta Claude Code, Cursor o cualquier IDE de codificación con IA a Vibefence en lugar de acceso directo a herramientas. Sin agentes de servidor, sin puertos entrantes.",
  },
  {
    step: "02",
    title: "Define la política",
    description: "Reglas declarativas: qué fuentes confías, qué acciones requieren aprobación, qué se ejecuta en sandbox. Per-action trust por defecto, override en .vibefence.yml.",
  },
  {
    step: "03",
    title: "Codea con guardrails",
    description: "Cada tool call pasa por procedencia + patrones de inyección + LLM intent (opcional) + lista de patrones críticos. Lo riesgoso se bloquea, sandboxea o encola para aprobación. En menos de 100 ms.",
  },
  {
    step: "04",
    title: "Audita y revierte",
    description: "Audit log unificado para SOC 2 / ISO 27001. Cambios de alto impacto vienen con snapshot + sandbox + aprobación. Si algo sale mal, rollback de un solo clic.",
  },
];

const trustLevels = [
  { source: "Política del sistema", trust: "SUPREMA (100)", color: "text-primary" },
  { source: "Instrucción tecleada por el usuario", trust: "ALTA (85)", color: "text-green-400" },
  { source: "Código fuente del repositorio", trust: "MEDIA (55)", color: "text-yellow-400" },
  { source: "README / Documentación", trust: "BAJA (30 → 10)", color: "text-red-400" },
  { source: "Página web / contenido externo", trust: "BAJA (20)", color: "text-red-400" },
  { source: "Plan del propio modelo", trust: "BAJA (10)", color: "text-red-400" },
];

export function HowItWorksSection() {
  return (
    <section id="como-funciona" className="py-24 md:py-32 relative bg-background bg-hex">
      {/* Top gradient overlay */}
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-background to-transparent pointer-events-none z-10" />
      
      {/* Center glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <SecurityIllustration className="absolute left-[-160px] bottom-10 h-[380px] w-[380px] opacity-20 max-lg:hidden" />
      
      <div className="container relative z-10">
        <div className="max-w-3xl mx-auto text-center mb-20">
          <Reveal delay={20}>
            <Pill className="mb-6">COMO FUNCIONA</Pill>
          </Reveal>
          <Reveal
            as="h2"
            delay={100}
            className="text-3xl sm:text-4xl md:text-5xl font-sans font-semibold mb-6 tracking-tight"
          >
            Procedencia <span className="text-primary">sobre contenido</span>
          </Reveal>
          <Reveal
            as="p"
            delay={180}
            className="font-mono text-foreground/60 text-sm sm:text-base"
          >
            Los escáneres de patrones leen el texto de un comando y deciden si parece peligroso. Vibefence pregunta otra cosa: <span className="text-primary">¿quién autoró este plan?</span> y gestiona la acción contra la fuente de menor confianza en la cadena. Mismo `ls -la` — autoría del usuario pasa, autoría de un README se bloquea.
          </Reveal>
        </div>

        <Reveal className="max-w-2xl mx-auto mb-20" delay={120}>
          <div
            className="border border-border bg-background/80 backdrop-blur-sm overflow-hidden"
            style={{
              clipPath: "polygon(12px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 12px 100%, 0 calc(100% - 12px), 0 12px)",
            }}
          >
            <div className="grid grid-cols-2 border-b border-border px-6 py-4 bg-foreground/5">
              <span className="font-mono text-xs uppercase tracking-wider text-foreground/40">
                Fuente
              </span>
              <span className="font-mono text-xs uppercase tracking-wider text-foreground/40 text-right">
                Nivel de Confianza
              </span>
            </div>
            {trustLevels.map((item, i) => (
              <div
                key={i}
                className="grid grid-cols-2 px-6 py-3 border-b border-border/50 last:border-0 hover:bg-foreground/5 transition-colors"
              >
                <span className="font-mono text-sm text-foreground/80">
                  {item.source}
                </span>
                <span className={`font-mono text-sm text-right ${item.color}`}>
                  {item.trust}
                </span>
              </div>
            ))}
          </div>
        </Reveal>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((item, i) => (
            <Reveal key={i} className="relative group" delay={100 + i * 80}>
              <div className="text-6xl font-sans font-bold text-foreground/5 group-hover:text-primary/10 transition-colors duration-300 mb-2">
                {item.step}
              </div>
              <h3 className="font-sans text-lg mb-2 tracking-tight">{item.title}</h3>
              <p className="font-mono text-sm text-foreground/60 leading-relaxed">
                {item.description}
              </p>
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-8 right-0 translate-x-1/2 text-foreground/20">
                  →
                </div>
              )}
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
