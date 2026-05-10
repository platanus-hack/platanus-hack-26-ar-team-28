"use client";

import { Pill } from "@/components/pill";
import { Reveal } from "@/components/reveal";

export function WhyNowSection() {
  return (
    <section id="por-que-ahora" className="py-24 md:py-32 relative bg-background overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 bg-grid pointer-events-none" />
      
      {/* Radial glow from bottom */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gradient-to-t from-primary/10 via-primary/5 to-transparent rounded-full blur-3xl pointer-events-none" />
      
      {/* Animated scan line */}
      <div className="absolute inset-0 bg-scanlines pointer-events-none opacity-50" />
      
      <div className="container relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <Reveal>
            <Pill className="mb-6">POR QUÉ AHORA</Pill>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-sans font-semibold mb-6 tracking-tight">
              La adopción explotó. <span className="text-primary">El governance no.</span>
            </h2>
            <p className="font-mono text-foreground/60 text-sm sm:text-base leading-relaxed mb-6">
              Claude Code, Cursor, Codex, Continue, Aider — penetración masiva en startups y mid-market en los últimos 18 meses. Los equipos que no están adoptando, lo están considerando.
            </p>
            <p className="font-mono text-foreground/60 text-sm sm:text-base leading-relaxed mb-8">
              Pero las organizaciones tratan al agente de IA como si fuera otro plugin del IDE. Sin SSO, sin audit log, sin RBAC, sin DLP. Sería inaceptable para un empleado humano. Vibefence es a los agentes de IA lo que CrowdStrike fue al endpoint, lo que Cloudflare fue al perímetro web — categoría nueva, tiempo correcto.
            </p>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="font-mono text-sm">Replit, julio 2025: la IA borró producción en una demo pública del CEO.</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: "0.2s" }} />
                <span className="font-mono text-sm">Stanford 2022: el código asistido por IA es estadísticamente menos seguro.</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: "0.4s" }} />
                <span className="font-mono text-sm">NYU 2023: ~40% del código de Copilot tiene vulnerabilidades CWE.</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: "0.6s" }} />
                <span className="font-mono text-sm">Greshake et al. 2023: la inyección indirecta de prompts es estructural.</span>
              </div>
            </div>
          </Reveal>

          <Reveal
            delay={120}
            className="border border-border bg-background/60 backdrop-blur-sm p-8 md:p-10 relative overflow-hidden group hover:border-primary/30 transition-colors duration-300"
            style={{
              clipPath: "polygon(20px 0, calc(100% - 20px) 0, 100% 20px, 100% calc(100% - 20px), calc(100% - 20px) 100%, 20px 100%, 0 calc(100% - 20px), 0 20px)",
            }}
          >
            {/* Inner glow effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ clipPath: "inherit" }} />
            
            {/* Corner brackets */}
            <div className="absolute top-3 left-3 w-6 h-6 border-l-2 border-t-2 border-primary/50" />
            <div className="absolute top-3 right-3 w-6 h-6 border-r-2 border-t-2 border-primary/50" />
            <div className="absolute bottom-3 left-3 w-6 h-6 border-l-2 border-b-2 border-primary/50" />
            <div className="absolute bottom-3 right-3 w-6 h-6 border-r-2 border-b-2 border-primary/50" />
            
            <h3 className="font-sans text-xs uppercase tracking-wider text-foreground/40 mb-6 relative z-10">
              Lo que reemplazamos en tu stack
            </h3>
            <div className="space-y-4 relative z-10">
              {[
                { label: "Lakera Guard", desc: "Detección de prompt injection" },
                { label: "GitGuardian + DLP", desc: "Protección de secretos y .env" },
                { label: "Lambdas caseras", desc: "Backup pre-migración destructiva" },
                { label: "Logs propios", desc: "Audit log de tool calls de la IA" },
                { label: "Pentest manual", desc: "Red-team continuo del código de IA" },
                { label: "Snyk parcialmente", desc: "AppSec específico para código IA" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-4 group/item">
                  <span className="text-primary font-mono text-sm group-hover/item:animate-pulse">+</span>
                  <div>
                    <span className="font-mono text-sm">{item.label}</span>
                    <span className="font-mono text-sm text-foreground/40 ml-2">
                      — {item.desc}
                    </span>
                  </div>
                </div>
                ))}
              </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
