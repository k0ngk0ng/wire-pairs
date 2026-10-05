import { assetUrl } from './assets';
import { effectBankPath } from './effectBankPath';
declare global { var __wirePairsEffects: Record<string, string> | undefined; }
let pending: Promise<Record<string, string>> | null = null;
export function loadEffectBank(): Promise<Record<string, string>> {
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const finish = (error?: Error) => {
      clearTimeout(timer); script.remove();
      const bank = globalThis.__wirePairsEffects;
      if (error || !bank) { pending = null; reject(error || new Error('Missing effect bank')); }
      else resolve(bank);
    };
    const timer = setTimeout(() => finish(new Error('Effect bank timed out')), 8000);
    script.async = true; script.src = assetUrl(effectBankPath);
    script.onload = () => finish(); script.onerror = () => finish(new Error('Effect bank unavailable'));
    document.head.append(script);
  });
  return pending;
}
