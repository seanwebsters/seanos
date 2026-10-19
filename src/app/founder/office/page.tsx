import Link from "next/link";
import { Office3D } from "@/components/Office3D";
import { Icon } from "@/components/Icon";
import { officeState } from "@/lib/founder/office";

export const dynamic = "force-dynamic";

export default async function OfficePage() {
  const office = await officeState();
  return (
    <div className="wide">
      <section className="fo-office relative overflow-hidden lg:mt-6 lg:rounded-[28px] lg:ring-1 lg:ring-line">
        <Office3D initial={office} className="h-[calc(100dvh-150px)] min-h-[460px] lg:h-[calc(100dvh-80px)]" overlay={
          <div className="pt-safe absolute left-0 top-0 z-[5] px-5 pt-4 lg:px-8 lg:pt-6">
            <Link href="/founder" className="flex items-center gap-1 text-[14px] text-[#d9c08f]"><Icon name="back" size={18} /> Founder OS</Link>
            <h1 className="display pointer-events-none mt-1 text-[40px] leading-none lg:text-[56px]">The office</h1>
            <p className="pointer-events-none mt-1 max-w-[16rem] text-[13px] text-white/60">Drag to look around. Screens and posture show real work only.</p>
          </div>
        } />
      </section>
    </div>
  );
}
