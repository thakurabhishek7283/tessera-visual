// tsdown replaces this with the version from package.json when it builds dist.
declare const __TESSERA_KIT_VERSION__: string | undefined;

/** This package's version, reported when two copies define the same tag. */
export const version: string =
  typeof __TESSERA_KIT_VERSION__ === 'string' ? __TESSERA_KIT_VERSION__ : '0.0.0-dev';
