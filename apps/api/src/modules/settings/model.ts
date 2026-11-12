import { t } from 'elysia';
import { MAX_CONCURRENT_RUNS, MAX_RUN_SECONDS, MIN_RUN_SECONDS } from './service';

export const StorageSettingsSchema = t.Object({
  maxAttachmentMb: t.Number(),
  maxAvatarMb: t.Number(),
  attachmentMimeTypes: t.Array(t.String()),
  projectQuotaMb: t.Number(),
});

export const InviteSearchSchema = t.Object({ enabled: t.Boolean() });

export const ProjectDefaultsSchema = t.Object({
  mcpEnabled: t.Boolean(),
});

export const AgentSettingsSchema = t.Object({
  traceRetentionDays: t.Integer({
    minimum: 0,
    maximum: 3650,
    description:
      'Days the traces of an agent run are kept for. 0 keeps them until they are deleted by hand.',
  }),
  maxRunSeconds: t.Integer({
    minimum: MIN_RUN_SECONDS,
    maximum: MAX_RUN_SECONDS,
    description:
      "Seconds one agent run may take before it is stopped and saved as failed. An agent's own limit cannot exceed it.",
  }),
  maxConcurrentRuns: t.Integer({
    minimum: 0,
    maximum: MAX_CONCURRENT_RUNS,
    description:
      'Runs of internal agents in flight at once across the instance; the rest wait in the ' +
      "queue. 0 sets no limit. A workspace's own limit cannot exceed it.",
  }),
});

// A command id bound to a combination written as modifier tokens plus a key
// ('mod+k', 'n'). The set of commands lives in the web app (its lib/hotkeys), so
// the API checks the shape and stores the map as given.
export const HotkeyCombosSchema = t.Record(
  t.String({ pattern: '^[a-z][a-z0-9.-]{0,63}$' }),
  t.String({ pattern: '^(mod\\+|shift\\+|alt\\+)*[a-z0-9]{1,10}$' }),
);

export const EmbedSitesSchema = t.Object({
  origins: t.Array(t.String({ maxLength: 300 }), {
    maxItems: 50,
    description:
      'Sites that may show the public pages in a frame, as origins such as https://example.com.',
  }),
});

const ReleaseSchema = t.Object({
  tag: t.String(),
  version: t.String(),
  publishedAt: t.String(),
  url: t.Nullable(t.String()),
  notes: t.String(),
  notesFormat: t.UnionEnum(['html', 'markdown']),
});

export const UpdateStatusSchema = t.Object({
  currentVersion: t.String(),
  latestVersion: t.Nullable(t.String()),
  updateAvailable: t.Boolean(),
  checkedAt: t.Nullable(t.String()),
  releases: t.Array(ReleaseSchema),
});

export const VersionResponse = t.Object({ version: t.String() });

const RenameSchema = t.Object({ from: t.String(), to: t.String() });

// What migration 0115 did to this instance's data, as the migration recorded it.
const TeamsMigrationSchema = t.Object({
  version: t.Number(),
  teams: t.Array(
    t.Object({
      name: t.String(),
      projects: t.Array(t.Object({ key: t.String(), name: t.String() })),
    }),
  ),
  renamed: t.Record(t.String(), t.Array(RenameSchema)),
  merged: t.Object({ roles: t.Number(), agentTools: t.Number() }),
  movedInvites: t.Number(),
  droppedNotificationSettings: t.Array(t.String()),
});

const BackupSchema = t.Object({
  path: t.String(),
  sizeBytes: t.Number(),
  createdAt: t.String(),
  expiresAt: t.String(),
  migrations: t.Array(t.String()),
});

export const WhatsNewSchema = t.Object({
  version: t.String(),
  pending: t.Boolean(),
  releases: t.Array(ReleaseSchema),
  backup: t.Nullable(BackupSchema),
  migration: t.Nullable(TeamsMigrationSchema),
});

// A logo is stored inline as a data URL so it needs no object storage, and is shown
// through <img> only, where an SVG cannot run script.
const Logo = t.Nullable(
  t.String({
    pattern: '^data:image/(png|jpeg|webp|svg\\+xml);base64,[A-Za-z0-9+/]+=*$',
    maxLength: 400_000,
  }),
);

export const BrandingSchema = t.Object({
  appName: t.Nullable(t.String({ maxLength: 40 })),
  accentColor: t.Nullable(t.String({ pattern: '^#[0-9a-fA-F]{6}$' })),
  logo: Logo,
  // Shown in the light theme instead of logo; null shows logo in both themes.
  logoLight: Logo,
});

export const BillingSettingsSchema = t.Object({
  hoursPerDay: t.Number({ minimum: 1, maximum: 24, description: 'Hours in a day of estimate.' }),
  internalDayRatePence: t.Nullable(
    t.Integer({ minimum: 0, description: 'Day rate in pence internal work is costed at.' }),
  ),
  reservePercent: t.Optional(
    t.Integer({
      minimum: 0,
      maximum: 100,
      description: 'Share of each cycle kept free for unplanned step-change work.',
    }),
  ),
});
