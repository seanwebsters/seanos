import { SignInForm } from "./form";
import { Art } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function SignIn() {
  const configured = Boolean(process.env.OWNER_PASSCODE);
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-bg lg:left-0">
      <Art seed="sign-in-sean-os" className="absolute inset-0 opacity-60" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/70 to-transparent" />
      <div className="relative mt-auto px-6 pb-[calc(env(safe-area-inset-bottom)+40px)] sm:mx-auto sm:mb-auto sm:mt-auto sm:w-[420px]">
        <div className="eyebrow">Private</div>
        <h1 className="display mt-2 text-[56px] leading-[0.95]">SEAN OS</h1>
        <p className="mt-3 text-[15px] text-muted">Your team has been working. Sign in to see what they've prepared.</p>
        {configured ? <SignInForm /> : <div className="mt-6 rounded-2xl bg-rose/10 p-4 text-[14px] text-rose">Set <code>OWNER_PASSCODE</code> and <code>SESSION_SECRET</code> in the server environment, then redeploy.</div>}
      </div>
    </div>
  );
}
