import path from 'path';

export const window = {
  showErrorMessage: () => Promise.resolve(undefined),
};

export const env = {
  openExternal: () => Promise.resolve(true),
};

export const Uri = {
  parse: (uri: string) => uri,
};

export const extensions = {
  getExtension: () => ({
    extensionPath: path.resolve(__dirname, '../../'),
  }),
};
