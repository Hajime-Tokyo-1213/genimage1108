/**
 * 環境変数を取得する共通関数
 * @param key - 環境変数のキー
 * @returns 環境変数の値、存在しない場合はundefined
 */
export const getEnvVar = (key: string): string | undefined => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  return undefined;
};

/**
 * サイトURLを解決する共通関数
 * @returns サイトURL、解決できない場合はundefined
 */
export const resolveSiteUrl = (): string | undefined => {
  const envSiteUrl = getEnvVar('VITE_SITE_URL') || getEnvVar('SITE_URL');
  if (envSiteUrl) {
    return envSiteUrl.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return undefined;
};