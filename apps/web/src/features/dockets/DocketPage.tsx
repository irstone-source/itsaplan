'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import MarkdownEditor from '@/components/common/editor/MarkdownEditor';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import DocketPageActions from './components/DocketPageActions';
import DocketPageEvidence from './components/DocketPageEvidence';
import DocketPageFacts from './components/DocketPageFacts';
import DocketPageFooter from './components/DocketPageFooter';
import DocketPageHeader from './components/DocketPageHeader';
import DocketPageScreenshots from './components/DocketPageScreenshots';
import { useLightPrint } from './hooks/useLightPrint';
import { useDocketQuery } from './services/dockets.service';
import { docketBodyForPage } from './utils/docketBody';

// The stamped record of one docket, laid out as an A4 document so "Save as PDF" prints it
// as it reads on screen.
export default function DocketPage() {
  const t = useTranslations('dockets');
  const { id } = useParams<{ id: string }>();
  const docketId = /^\d+$/.test(id) ? Number(id) : null;
  const { data: docket, isError } = useDocketQuery(docketId);
  useDocumentTitle(docket?.number ?? t('title'));
  useLightPrint();

  if (docketId == null || isError) {
    return <p className="p-8 text-center text-sm text-muted-foreground">{t('notFound')}</p>;
  }
  if (!docket) return null;

  return (
    <main
      data-docket
      className="mx-auto max-w-[210mm] space-y-4 px-4 py-8 [-webkit-print-color-adjust:exact] [print-color-adjust:exact] print:max-w-none print:p-0"
    >
      <DocketPageActions issueId={docket.issue.id} />
      <article className="space-y-8 rounded-lg border bg-card p-6 sm:p-10 print:rounded-none print:border-0 print:bg-transparent print:p-0">
        <DocketPageHeader docket={docket} />
        <DocketPageFacts docket={docket} />
        <DocketPageEvidence docket={docket} />
        {docket.body && (
          <section className="space-y-2">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t('record')}
            </h2>
            <MarkdownEditor
              className="text-sm [&_table]:break-inside-avoid [&_tr]:break-inside-avoid"
              defaultValue={docketBodyForPage(docket.body)}
              editable={false}
            />
          </section>
        )}
        <DocketPageScreenshots attachments={docket.attachments} />
        <DocketPageFooter docket={docket} />
      </article>
    </main>
  );
}
