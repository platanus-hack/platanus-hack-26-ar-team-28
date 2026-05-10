import { AuthForm } from "@/components/auth/auth-form";
import { InstallHint } from "@/components/auth/install-hint";
import { signup } from "../actions";

export default function SignupPage() {
  return (
    <div className="space-y-6">
      <AuthForm mode="signup" action={signup} />
      <InstallHint />
    </div>
  );
}
