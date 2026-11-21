import { useTranslations } from 'next-intl';
import type { Docket } from '@/lib/api/endpoints/dockets';
import DocketPageVerify from './DocketPageVerify';

export default function DocketPageFooter({ docket }: { docket: Docket }) {
  const t = useTranslations('dockets');
  if (!docket.fingerprint) return null;
  return (
    <footer className="break-inside-avoid space-y-3 border-t-2 border-foreground pt-4">
      <div className="space-y-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t('fingerprint')}
        </p>
        <p className="font-mono text-xs break-all" dir="ltr">
          {docket.fingerprint}
        </p>
      </div>
      <DocketPageVerify docketId={docket.id} />
    </footer>
  );
}
