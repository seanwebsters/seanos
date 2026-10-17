import Link from "next/link";
import { Icon } from "./Icon";
import { Art } from "./ui";
import { PrintButton } from "./client";

/** Full-screen, swipeable, printable slide deck (Print → Save as PDF). */
export function Deck({ title, slides, back, images = [] }: { title: string; slides: { title: string; bullets: string[]; notes?: string }[]; back: string; images?: string[] }) {
  return (
    <div className="fixed inset-0 z-[60] bg-[#0a0a0b] text-[#f3efe6] print:static">
      <div className="pt-safe absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-3 print:hidden">
        <Link href={back} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 backdrop-blur" aria-label="Close"><Icon name="close" size={18} /></Link>
        <div className="text-[12px] uppercase tracking-[0.18em] opacity-60">{slides.length} slides · swipe</div>
        <PrintButton />
      </div>
      <div className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto print:block print:h-auto print:overflow-visible">
        <section className="relative flex h-full w-full shrink-0 snap-center items-end print:h-[100vh] print:break-after-page">
          {images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={images[0]} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
          ) : <Art seed={title} className="absolute inset-0" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
          <div className="relative max-w-3xl p-8 pb-16 sm:p-16">
            <div className="text-[12px] uppercase tracking-[0.2em] opacity-70">SEAN OS · Confidential draft</div>
            <h1 className="display mt-3 text-[54px] leading-[0.95] sm:text-[84px]">{title}</h1>
          </div>
        </section>
        {slides.map((s, i) => (
          <section key={i} className="flex h-full w-full shrink-0 snap-center items-center print:h-[100vh] print:break-after-page">
            <div className="mx-auto w-full max-w-3xl px-8 sm:px-16">
              <div className="text-[12px] uppercase tracking-[0.2em] text-[#d9c08f]">{String(i + 1).padStart(2, "0")}</div>
              <h2 className="display mt-3 text-[44px] leading-[1] sm:text-[64px]">{s.title}</h2>
              <ul className="mt-8 space-y-4 font-serif text-[20px] leading-snug sm:text-[24px]">
                {s.bullets.map((b, j) => <li key={j} className="flex gap-4"><span className="mt-3 h-px w-6 shrink-0 bg-[#d9c08f]" />{b}</li>)}
              </ul>
              {images[i + 1] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={images[i + 1]} alt="" className="mt-8 max-h-[30vh] rounded-2xl object-cover" />
              )}
              {s.notes && <p className="mt-10 text-[13px] opacity-50 print:hidden">Notes: {s.notes}</p>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
