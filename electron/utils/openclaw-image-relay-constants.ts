export const CLAWX_OPENAI_IMAGE_PROVIDER_KEY = 'clawx-openai-image';
export const CLAWX_OPENAI_IMAGE_DEFAULT_MODEL = 'gpt-image-2';
export const CLAWX_OPENAI_IMAGE_DEFAULT_REF = `${CLAWX_OPENAI_IMAGE_PROVIDER_KEY}/${CLAWX_OPENAI_IMAGE_DEFAULT_MODEL}`;

/**
 * Resolve the primary image-generation model ref from a raw openclaw config.
 *
 * Handles the three shapes `agents.defaults.imageGenerationModel` may take:
 *   - `string`                  → treated as the primary ref directly
 *   - `{ primary: string, ... }`→ uses the `primary` field
 *   - null / undefined / other  → returns null
 *
 * This is the single source of truth shared by the Gateway prelaunch sync
 * (config-sync.ts) and the settings API (openclaw-image-generation.ts) so the
 * two code paths can never diverge on how they read this value.
 */
export function resolveImageGenerationPrimary(config: unknown): string | null {
  if (!config || typeof config !== 'object') return null;
  const agents = (config as { agents?: unknown }).agents;
  if (!agents || typeof agents !== 'object') return null;
  const defaults = (agents as { defaults?: unknown }).defaults;
  if (!defaults || typeof defaults !== 'object') return null;
  const imageGenerationModel = (defaults as { imageGenerationModel?: unknown }).imageGenerationModel;
  if (typeof imageGenerationModel === 'string') {
    return imageGenerationModel.trim() || null;
  }
  if (imageGenerationModel && typeof imageGenerationModel === 'object') {
    const primary = (imageGenerationModel as { primary?: unknown }).primary;
    return typeof primary === 'string' && primary.trim() ? primary.trim() : null;
  }
  return null;
}
