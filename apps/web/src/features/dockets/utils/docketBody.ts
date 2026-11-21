// Sections the page renders from the docket's own fields, so the body would repeat them.
const OWN_SECTIONS = ['Screenshots', 'Evidence this is complete', 'Blocker'];

// An image in the body may only be an attachment served by this origin.
const SAFE_IMAGE = /^\/media\/attachments\//;

export function docketBodyForPage(body: string): string {
  const kept: string[] = [];
  let skipping = false;
  for (const line of body.split('\n')) {
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) skipping = OWN_SECTIONS.includes(heading[1].trim());
    if (!skipping) kept.push(line);
  }
  return kept
    .join('\n')
    .replace(/!\[([^\]]*)\]\(([^)\s]*)[^)]*\)/g, (image, alt: string, url: string) =>
      SAFE_IMAGE.test(url) ? image : alt,
    )
    .replace(/<img\b[^>]*>/gi, '');
}
