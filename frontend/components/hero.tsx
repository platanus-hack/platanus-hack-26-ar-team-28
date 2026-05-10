"use client";

import Link from "next/link";
import { GL } from "./gl";
import { Pill } from "./pill";
import { Reveal } from "./reveal";
import { SecurityIllustration } from "./security-illustration";
import { Button } from "./ui/button";
import { useState } from "react";

export function Hero() {
  const [hovering, setHovering] = useState(false);
  return (
    <div className="flex min-h-svh items-center justify-center relative overflow-hidden">
      <GL hovering={hovering} />
      <SecurityIllustration className="absolute left-1/2 top-1/2 z-[1] h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 opacity-45 max-md:h-[360px] max-md:w-[360px]" />

      <div className="py-24 md:py-32 text-center relative z-10">
        <Reveal delay={40} intensity="soft">
          <Pill className="mb-6">GOVERNANCE EN RUNTIME PARA INGENIERÍA CON IA</Pill>
        </Reveal>

        <Reveal
          as="h1"
          delay={120}
          intensity="strong"
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-sans font-semibold tracking-[-0.04em] text-balance max-w-4xl mx-auto px-4 leading-[1.08]"
        >
          <span className="hero-line block">TU IA TIENE ROOT.</span>
          <span className="hero-line block text-primary">VIBEFENCE SE LO QUITA.</span>
        </Reveal>

        <Reveal
          as="p"
          delay={200}
          intensity="soft"
          className="font-mono text-sm sm:text-[15px] text-foreground/60 text-balance mt-6 max-w-[560px] mx-auto px-4 leading-7"
        >
          Identity, audit y reversibilidad para los agentes de IA en tu equipo de ingeniería. Una sola plataforma — no cinco herramientas puntuales — que cubre prompt injection, DLP, snapshots, red-team y audit log en el mismo runtime.
        </Reveal>

        <Reveal delay={280}>
          <div className="mt-12 flex items-center justify-center gap-3 max-sm:hidden">
            <Link href="/login">
              <Button
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => setHovering(false)}
              >
                [Iniciar sesión]
              </Button>
            </Link>
            <Link href="/signup">
              <Button
                variant="outline"
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => setHovering(false)}
              >
                [Crear cuenta]
              </Button>
            </Link>
          </div>
          <div className="mt-12 flex items-center justify-center gap-3 sm:hidden">
            <Link href="/login">
              <Button
                size="sm"
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => setHovering(false)}
              >
                [Iniciar sesión]
              </Button>
            </Link>
            <Link href="/signup">
              <Button
                size="sm"
                variant="outline"
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => setHovering(false)}
              >
                [Crear cuenta]
              </Button>
            </Link>
          </div>
        </Reveal>
      </div>
      
      {/* Fade out gradient at bottom of hero */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none z-10" />
    </div>
  );
}
