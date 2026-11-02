'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { API_URL } from '@/lib/api/core/client';
import { apiKeysPath, myTimePath } from '@/utils/paths';
import { useApiKeyCountQuery, useMyTimeStatusQuery } from './services/timecap.service';
import TimecapSetupStep from './components/TimecapSetupStep';
import TimecapCommand from './components/TimecapCommand';

const ACTIVITYWATCH_URL = 'https://activitywatch.net';
const AGENT_PATH = '~/.local/bin/plan-time.mjs';

// The four steps to a first sync, each checked against what the API already knows.
// The status is polled until a sync arrives.
export default function TimecapSetupPage() {
  const t = useTranslations('timecap.setup');
  const { data: status } = useMyTimeStatusQuery(15_000);
  const { data: apiKeys } = useApiKeyCountQuery();
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  const devices = status?.devices ?? [];
  const trackerOk = devices.some((d) => d.trackerOk);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
        <div>
          <h1 className="text-lg font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>

        <TimecapSetupStep
          number={1}
          title={t('steps.activitywatch.title')}
          body={t('steps.activitywatch.body')}
          check={t('steps.activitywatch.check')}
          done={trackerOk}
        >
          <Button asChild variant="outline" size="sm">
            <a href={ACTIVITYWATCH_URL} target="_blank" rel="noreferrer">
              {t('steps.activitywatch.link')}
              <ExternalLink />
            </a>
          </Button>
        </TimecapSetupStep>

        <TimecapSetupStep
          number={2}
          title={t('steps.apiKey.title')}
          body={t('steps.apiKey.body')}
          check={t('steps.apiKey.check')}
          done={(apiKeys ?? 0) > 0}
        >
          <Button asChild variant="outline" size="sm">
            <Link href={apiKeysPath()}>{t('steps.apiKey.link')}</Link>
          </Button>
        </TimecapSetupStep>

        <TimecapSetupStep
          number={3}
          title={t('steps.agent.title')}
          body={t('steps.agent.body')}
          check={t('steps.agent.check')}
          done={devices.length > 0}
        >
          <TimecapCommand
            command={`mkdir -p ~/.local/bin && curl -fsSL ${origin}/plan-time.mjs -o ${AGENT_PATH}`}
          />
          <TimecapCommand command={`node ${AGENT_PATH} setup ${API_URL}`} />
        </TimecapSetupStep>

        <TimecapSetupStep
          number={4}
          title={t('steps.sync.title')}
          body={t('steps.sync.body')}
          check={t('steps.sync.check')}
          done={status?.active ?? false}
        >
          <TimecapCommand command={`node ${AGENT_PATH} watch`} />
          {status?.active && (
            <Button asChild size="sm">
              <Link href={myTimePath()}>{t('steps.sync.open')}</Link>
            </Button>
          )}
        </TimecapSetupStep>

        <section className="space-y-2 rounded-md border px-4 py-3">
          <h2 className="text-sm font-medium">{t('calls.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('calls.body')}</p>
          <TimecapCommand command={`node ${AGENT_PATH} watch --calls`} />
        </section>
      </div>
    </div>
  );
}
