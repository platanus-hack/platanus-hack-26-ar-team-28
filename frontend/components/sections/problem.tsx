"use client";

import { Pill } from "@/components/pill";
import { Reveal } from "@/components/reveal";
import { SecurityIllustration } from "@/components/security-illustration";

export function ProblemSection() {
  return (
    <section className="py-24 md:py-32 relative bg-background bg-grid">
      {/* Top glow */}
      <div className="absolute top-0 left-0 right-0 h-64 bg-radial-glow pointer-events-none" />
      <SecurityIllustration className="absolute right-[-140px] top-16 h-[360px] w-[360px] opacity-20 max-lg:hidden" />
      
      <div className="container relative z-10">
        <div className="max-w-3xl mx-auto text-center">
          <Reveal delay={20}>
            <Pill className="mb-6">EL PROBLEMA</Pill>
          </Reveal>
          <Reveal
            as="h2"
            delay={100}
            className="text-3xl sm:text-4xl md:text-5xl font-sans font-semibold mb-8 tracking-tight"
          >
            Tu IA llegó al equipo <span className="text-primary">sin SSO, sin audit log, sin permisos mínimos</span>
          </Reveal>
          <Reveal
            as="p"
            delay={180}
            className="font-mono text-foreground/60 text-sm sm:text-base leading-relaxed mb-12"
          >
            Acabas de darle shell, base de datos y deploy a tu empleado más productivo. Pero ese empleado no tiene identity, no tiene DLP, no tiene policy. Tres cosas pasan, todas reales, todas documentadas.
          </Reveal>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mt-16">
          {[
            {
              title: "Exfiltración por inyección",
              description: "Un README envenenado le hace exfiltrar tu .env, kubeconfig o customer PII. Greshake et al. (2023) demostraron formalmente esta superficie. Los escáneres de prompts no la atrapan: el problema es estructural.",
            },
            {
              title: "Borrado de producción",
              description: "Replit, julio 2025: el agente de IA borró la base de datos de producción de un cliente en una demo pública del CEO. Pasó. Va a volver a pasar. Sin reversibilidad por defecto, no hay forma de recuperarse.",
            },
            {
              title: "Código generado vulnerable",
              description: "Stanford 2022 (Perry et al.) y NYU 2023 (Pearce et al.): los desarrolladores con asistente de IA escriben código menos seguro, y ~40% del código de Copilot tiene vulnerabilidades CWE. Tu code review humano no escala a la velocidad de la IA.",
            },
          ].map((item, i) => (
            <Reveal
              key={i}
              delay={120 + i * 90}
              className="border border-border bg-background/80 backdrop-blur-sm p-6 md:p-8 relative group hover:border-primary/30 transition-colors duration-300"
              style={{
                clipPath: "polygon(12px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 12px 100%, 0 calc(100% - 12px), 0 12px)",
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ clipPath: "inherit" }} />
              <div className="relative z-10">
                <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mb-4">
                  <span className="text-primary font-mono text-sm">{i + 1}</span>
                </div>
                <h3 className="font-sans text-lg mb-3 tracking-tight">{item.title}</h3>
                <p className="font-mono text-sm text-foreground/60 leading-relaxed">
                  {item.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
