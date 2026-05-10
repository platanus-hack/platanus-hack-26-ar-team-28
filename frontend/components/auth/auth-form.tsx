"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { type AuthState } from "@/app/(auth)/actions";

interface Props {
  mode: "login" | "signup";
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
}

export function AuthForm({ mode, action }: Props) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    undefined,
  );

  const title = mode === "login" ? "Sign in" : "Create account";
  const altText = mode === "login" ? "New here?" : "Already have an account?";
  const altHref = mode === "login" ? "/signup" : "/login";
  const altLabel = mode === "login" ? "Create one" : "Sign in";

  return (
    <div className="border border-primary/20 bg-background/40 backdrop-blur-sm p-8 space-y-6">
      <div className="space-y-2">
        <h1 className="font-sentient text-3xl text-foreground">{title}</h1>
        <p className="font-mono text-xs uppercase text-foreground/50 tracking-wider">
          {mode === "login" ? "// vibefence command center" : "// pair with vibefence"}
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="block font-mono uppercase text-xs text-foreground/60 tracking-wider">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full bg-background border border-border px-4 h-12 font-mono text-sm focus:outline-none focus:border-primary/60 transition-colors"
          />
          {state?.fieldErrors?.email && (
            <p className="font-mono text-xs text-red-400">{state.fieldErrors.email}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="block font-mono uppercase text-xs text-foreground/60 tracking-wider">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={8}
            className="w-full bg-background border border-border px-4 h-12 font-mono text-sm focus:outline-none focus:border-primary/60 transition-colors"
          />
          {state?.fieldErrors?.password && (
            <p className="font-mono text-xs text-red-400">{state.fieldErrors.password}</p>
          )}
        </div>

        {state?.error && (
          <p className="font-mono text-xs text-red-400 border border-red-400/30 bg-red-400/5 px-3 py-2">
            {state.error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "..." : title}
        </Button>
      </form>

      <p className="font-mono text-xs text-foreground/50 text-center">
        {altText}{" "}
        <Link href={altHref} className="text-primary hover:text-primary/80 transition-colors">
          {altLabel}
        </Link>
      </p>
    </div>
  );
}
