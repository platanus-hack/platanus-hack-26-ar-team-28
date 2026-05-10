"use client";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/reveal";
import Link from "next/link";

export function CTASection() {
  return (
    <section id="comenzar" className="py-24 md:py-32 relative bg-background overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-diagonal pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      
      <div className="container relative z-10">
        <Reveal
          className="max-w-4xl mx-auto border border-border bg-background/80 backdrop-blur-sm p-10 md:p-16 text-center relative overflow-hidden"
          style={{
            clipPath: "polygon(24px 0, calc(100% - 24px) 0, 100% 24px, 100% calc(100% - 24px), calc(100% - 24px) 100%, 24px 100%, 0 calc(100% - 24px), 0 24px)",
          }}
        >
          {/* Inner glow */}
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-primary/5 pointer-events-none" style={{ clipPath: "inherit" }} />
          
          {/* Decorative corner elements */}
          <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-primary/50" />
          <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-primary/50" />
          <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-primary/50" />
          <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-primary/50" />

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-sans font-semibold mb-4 tracking-tight relative z-10">
            Reemplaza cinco contratos. <span className="text-primary">Empieza hoy.</span>
          </h2>
          <p className="font-mono text-foreground/60 text-sm sm:text-base max-w-2xl mx-auto mb-8 relative z-10">
            Vibefence consolida prompt injection detection, DLP, snapshots, audit log y red-team en una sola plataforma. Diseñada con tu CISO y tu VP de Ingeniería en mente. Despliegue en menos de un día.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center relative z-10">
            <Link href="/login">
              <Button size="lg">[Iniciar sesión]</Button>
            </Link>
            <Link href="/signup">
              <Button size="lg" variant="outline">
                [Crear cuenta]
              </Button>
            </Link>
          </div>

          <p className="font-mono text-xs text-foreground/40 mt-8 relative z-10">
            Para equipos de ingeniería con 10–500 desarrolladores que adoptaron Claude Code, Cursor o Codex.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
