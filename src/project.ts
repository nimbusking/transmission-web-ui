const repository = 'https://github.com/nimbusking/transmission-web-ui';

// Keep repository documents here until a published release has a dedicated destination.
export const PROJECT_LINKS = {
  home: repository,
  guide: `${repository}/blob/main/README.md`,
  updates: `${repository}/blob/main/docs/implementation-progress.md`,
  blog: 'https://nimbusk.cc',
  license: `${repository}/blob/main/LICENSE`,
} as const;
