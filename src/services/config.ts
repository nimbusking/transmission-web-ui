import { z } from 'zod';
const schema = z.object({
  rpcUrl: z.string().default('../rpc'),
  defaultLocale: z.string().default('auto'),
  refreshIntervalMs: z.number().min(2000).max(300000).default(5000),
  releaseApi: z.string().url().optional(),
});
export type RuntimeConfig = z.infer<typeof schema>;
export async function loadConfig(): Promise<RuntimeConfig> {
  const response = await fetch(new URL('app-config.json', document.baseURI), { cache: 'no-store' });
  if (!response.ok && response.status !== 404)
    throw new Error(`Configuration HTTP ${response.status}`);
  const config = schema.parse(response.status === 404 ? {} : await response.json());
  const rpc = new URL(config.rpcUrl, document.baseURI);
  if (rpc.origin !== location.origin || rpc.username || rpc.password)
    throw new Error('RPC must use the same origin and must not contain credentials');
  return { ...config, rpcUrl: rpc.href };
}
