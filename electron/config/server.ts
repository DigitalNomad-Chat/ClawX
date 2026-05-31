/**
 * 后端 API 服务器地址
 *
 * ⚠️ 发布前必须修改为实际服务器地址，然后重新打包。
 *
 * 开发模式可通过 GUADA_API_URL 环境变量临时覆盖，方便本地调试。
 */
export const API_BASE_URL = 'https://clawdock.ins-ai.top';

/**
 * 解析实际使用的 API 基础地址
 * 优先级：环境变量 > 硬编码配置
 */
export function resolveApiBaseUrl(): string {
  if (process.env.GUADA_API_URL) {
    return process.env.GUADA_API_URL.trim();
  }
  return API_BASE_URL;
}
