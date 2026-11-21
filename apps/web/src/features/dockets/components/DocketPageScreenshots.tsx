import { useTranslations } from 'next-intl';
import type { DocketAttachment } from '@/lib/api/endpoints/dockets';
import { mediaUrl } from '@/lib/api/core/media';

export default function DocketPageScreenshots({
  attachments,
}: {
  attachments: DocketAttachment[];
}) {
  const t = useTranslations('dockets');
  const images = attachments.filter((a) => a.contentType.startsWith('image/'));
  if (images.length === 0) return null;
  return (
    <section className="space-y-6 print:break-before-page">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {t('screenshots')}
      </h2>
      {images.map((a) => (
        <figure key={a.publicId} className="break-inside-avoid space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- served by the api through /media */}
          <img src={mediaUrl(a.url)} alt={a.filename} className="w-full rounded-md border" />
          <figcaption className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
            <span dir="auto">{a.filename}</span>
            <span className="font-mono" dir="ltr" title={a.sha256}>
              {t('sha256', { hash: `${a.sha256.slice(0, 12)}…` })}
            </span>
          </figcaption>
        </figure>
      ))}
    </section>
  );
}
