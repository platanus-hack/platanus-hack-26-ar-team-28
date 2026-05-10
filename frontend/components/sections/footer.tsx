"use client";

import { Logo } from "@/components/logo";
import { Reveal } from "@/components/reveal";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="py-12 border-t border-border relative bg-background">
      {/* Subtle grid */}
      <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
      
      <Reveal className="container relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div className="flex flex-col gap-4">
            <Logo className="w-[120px] md:w-[140px]" />
            <p className="font-mono text-xs text-foreground/40 max-w-xs">
              Runtime governance para los agentes de IA en tu equipo de ingeniería. Una plataforma, no cinco herramientas.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-8 gap-y-4 font-mono text-sm">
            <Link
              href="#producto"
              className="text-foreground/60 hover:text-primary transition-colors"
            >
              Producto
            </Link>
            <Link
              href="#como-funciona"
              className="text-foreground/60 hover:text-primary transition-colors"
            >
              Como Funciona
            </Link>
            <Link
              href="#por-que-ahora"
              className="text-foreground/60 hover:text-primary transition-colors"
            >
              Por Que Ahora
            </Link>
            <Link
              href="#docs"
              className="text-foreground/60 hover:text-primary transition-colors"
            >
              Docs
            </Link>
          </nav>
        </div>

        <div className="mt-12 pt-8 border-t border-border/50 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="font-mono text-xs text-foreground/40">
            &copy; {new Date().getFullYear()} Vibefence. Todos los derechos reservados.
          </p>
          <div className="flex gap-6 font-mono text-xs">
            <Link
              href="#privacidad"
              className="text-foreground/40 hover:text-foreground/60 transition-colors"
            >
              Privacidad
            </Link>
            <Link
              href="#terminos"
              className="text-foreground/40 hover:text-foreground/60 transition-colors"
            >
              Terminos
            </Link>
          </div>
        </div>
      </Reveal>
    </footer>
  );
}
