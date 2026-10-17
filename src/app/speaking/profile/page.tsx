import { getProfile } from "@/lib/bootstrap";
import { PageHeader, Section } from "@/components/ui";
import { CopyButton, Delegate } from "@/components/client";
import { SpeakerEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function SpeakerProfile() {
  const p = await getProfile();
  const sp = p.speaker;
  return (
    <div>
      <PageHeader back="/speaking" title="Speaker profile" eyebrow="Reusable" subtitle="Built only from credentials you've confirmed. Agents never add achievements." actions={<Delegate label="Draft it" kind="speaker_profile" className="btn-primary" icon="sparkle" />} />
      <Section title="Credentials you've confirmed">
        <SpeakerEditor speaker={sp} />
      </Section>
      {[["Short bio", sp.bio_short], ["Long bio", sp.bio_long], ["Short introduction", sp.intro_short], ["Long introduction", sp.intro_long]].map(([k, v]) => v ? (
        <Section key={k} title={k} action={<CopyButton text={v} />}>
          <p className="mx-5 font-serif text-[16.5px] leading-relaxed lg:mx-0">{v}</p>
        </Section>
      ) : null)}
      <Section title="Keynote topics">
        <div className="mx-5 space-y-2 lg:mx-0">
          {sp.topics.map((t) => <div key={t.title} className="card p-4"><div className="font-serif text-[18px] font-medium leading-snug">{t.title}</div>{t.description && <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{t.description}</p>}</div>)}
        </div>
      </Section>
    </div>
  );
}
