const configuredBase = import.meta.env.VITE_ASSET_BASE_URL as string | undefined;
export const assetBase = (configuredBase || `${import.meta.env.BASE_URL}assets/`).replace(/\/?$/, '/');
export const assetUrl = (path: string) => assetBase + path.replace(/^\//, '');
