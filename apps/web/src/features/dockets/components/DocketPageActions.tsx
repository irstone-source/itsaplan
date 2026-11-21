import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { issueByIdPath } from '@/utils/paths';

export default function DocketPageActions({ issueId }: { issueId: number }) {
  const t = useTranslations('dockets');
  return (
    <div className="flex items-center gap-2 print:hidden">
      <Button asChild variant="ghost" size="sm">
        <Link href={issueByIdPath(issueId)}>
          <ArrowLeft className="rtl:rotate-180" />
          {t('backToTicket')}
        </Link>
      </Button>
      <Button size="sm" className="ms-auto" onClick={() => window.print()}>
        <Printer />
        {t('savePdf')}
      </Button>
    </div>
  );
}
