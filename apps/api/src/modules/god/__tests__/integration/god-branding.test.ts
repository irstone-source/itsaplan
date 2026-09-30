import { describe, it, expect, beforeEach } from 'bun:test';
import { resetDb } from '#tests/helpers/db';
import { addUser, setup } from '../helpers';
import { app } from '#tests/helpers/app';

const LOGO = 'data:image/png;base64,iVBORw0KGgo=';
const LOGO_LIGHT = 'data:image/svg+xml;base64,PHN2Zy8+';

describe('god branding', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('is public to read, defaults to null fields, and only god may set it', async () => {
    const anon = await app.handle(new Request('http://localhost/settings/branding'));
    expect(anon.status).toBe(200);
    expect(await anon.json()).toEqual({
      appName: null,
      accentColor: null,
      logo: null,
      logoLight: null,
    });

    const { god } = await setup();
    const other = await addUser();
    const branding = {
      appName: '  Cambray  ',
      accentColor: '#1f6f5c',
      logo: LOGO,
      logoLight: LOGO_LIGHT,
    };
    expect((await other.api.god.branding.put(branding)).status).toBe(403);

    const res = await god.api.god.branding.put(branding);
    expect(res.status).toBe(200);
    expect(res.data!.appName).toBe('Cambray');

    const read = await app.handle(new Request('http://localhost/settings/branding'));
    expect(await read.json()).toEqual({ ...branding, appName: 'Cambray' });
  });

  it('refuses a colour that is not #rrggbb and a logo that is not an image data URL', async () => {
    const { god } = await setup();
    const base = { appName: null, accentColor: null, logo: null, logoLight: null };
    expect((await god.api.god.branding.put({ ...base, accentColor: 'red;}' })).status).toBe(400);
    expect(
      (await god.api.god.branding.put({ ...base, logo: 'data:text/html;base64,PHNjcmlwdD4=' }))
        .status,
    ).toBe(400);
    expect(
      (await god.api.god.branding.put({ ...base, logoLight: 'data:text/html;base64,PHNjcmlwdD4=' }))
        .status,
    ).toBe(400);
  });
});
