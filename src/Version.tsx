export const appVersion = import.meta.env.VITE_APP_VERSION || 'dev';
export default function Version({ className = '' }: { className?: string }) {
  return <small className={`version-label ${className}`} aria-label={`版本 ${appVersion}`}>{appVersion}</small>;
}
