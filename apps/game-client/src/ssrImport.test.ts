import { expect, test } from 'vitest';

// apps/web renders pages that import this package on the server, where there is
// no document and relative URLs cannot be fetched. Importing must stay side-effect free.
test('the package entry can be imported without a browser', async () => {
  expect(typeof document).toBe('undefined');
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => rejections.push(reason);
  process.on('unhandledRejection', onRejection);

  const entry = await import('./index');
  await new Promise((resolve) => setTimeout(resolve, 300));

  process.off('unhandledRejection', onRejection);
  expect(typeof entry.createArena).toBe('function');
  expect(rejections).toEqual([]);
});
