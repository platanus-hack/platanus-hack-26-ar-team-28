"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const Credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type AuthState = {
  error?: string;
  fieldErrors?: { email?: string; password?: string };
} | undefined;

export async function login(
  _: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = Credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    return { fieldErrors: { email: flat.email?.[0], password: flat.password?.[0] } };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message };
  redirect("/dashboard");
}

export async function signup(
  _: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = Credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    return { fieldErrors: { email: flat.email?.[0], password: flat.password?.[0] } };
  }

  // Create user via admin API to bypass the confirmation-email rate limit on
  // the free tier. Treats the password itself as proof of intent — the user
  // typed it on our domain, and we immediately log them in below.
  const admin = createServiceClient();
  const { error: adminError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });
  if (adminError) {
    if (adminError.message.toLowerCase().includes("already")) {
      return { error: "Account already exists. Try signing in instead." };
    }
    return { error: adminError.message };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword(parsed.data);
  if (signInError) return { error: signInError.message };
  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
