#!/usr/bin/env zx

/**
 * patch-openclaw-image-url.mjs
 *
 * OpenClaw SDK 的 parseOpenAiCompatibleImageResponse 只识别 b64_json。
 * 当 relay（例如 LiteLLM/openai）返回 url 字段时，SDK 会抛出
 * "image generation response malformed"。
 *
 * 本 patch 让 SDK 在 b64_json 缺失时自动下载 url，转成 base64 后继续
 * 走原有流程。对 b64_json 响应保持完全兼容。
 *
 * 用于：
 * - node_modules/openclaw/dist/image-generation-*.js（dev）
 * - build/openclaw/dist/image-generation-*.js（bundled）
 */

import 'zx/globals';
import fs from 'node:fs';
import path from 'node:path';

const ENTRY_FN_OLD = `function generatedImageAssetFromOpenAiCompatibleEntry(entry, index, options = {}) {
	return generatedImageAssetFromBase64({
		base64: normalizeOptionalString(entry.b64_json),
		index,
		mimeType: normalizeOptionalString(entry.mime_type),
		revisedPrompt: normalizeOptionalString(entry.revised_prompt),
		defaultMimeType: options.defaultMimeType,
		fileNamePrefix: options.fileNamePrefix,
		sniffMimeType: options.sniffMimeType
	});
}`;

const ENTRY_FN_NEW = `async function generatedImageAssetFromOpenAiCompatibleEntry(entry, index, options = {}) {
	let base64 = normalizeOptionalString(entry.b64_json);
	if (!base64) {
		const url = normalizeOptionalString(entry.url);
		if (url) {
			try {
				const res = await fetch(url);
				if (res.ok) {
					const buffer = Buffer.from(await res.arrayBuffer());
					base64 = buffer.toString('base64');
				}
			} catch (error) {
				// Fall through to let the existing base64 validation report the issue.
			}
		}
	}
	return generatedImageAssetFromBase64({
		base64,
		index,
		mimeType: normalizeOptionalString(entry.mime_type),
		revisedPrompt: normalizeOptionalString(entry.revised_prompt),
		defaultMimeType: options.defaultMimeType,
		fileNamePrefix: options.fileNamePrefix,
		sniffMimeType: options.sniffMimeType
	});
}`;

const PARSE_FN_OLD = `function parseOpenAiCompatibleImageResponse(payload, options = {}) {
	if (!isRecord(payload)) {
		throwMalformedImageResponse(options.malformedResponseError);
		return [];
	}
	const data = payload.data;
	if (data === void 0 || data === null) return [];
	if (!Array.isArray(data)) {
		throwMalformedImageResponse(options.malformedResponseError);
		return [];
	}
	const images = [];
	for (const [index, entry] of data.entries()) {
		if (!isRecord(entry)) {
			throwMalformedImageResponse(options.malformedResponseError);
			continue;
		}
		const image = generatedImageAssetFromOpenAiCompatibleEntry(entry, index, options);
		if (!image) {
			throwMalformedImageResponse(options.malformedResponseError);
			continue;
		}
		images.push(image);
	}
	return images;
}`;

const PARSE_FN_NEW = `async function parseOpenAiCompatibleImageResponse(payload, options = {}) {
	if (!isRecord(payload)) {
		throwMalformedImageResponse(options.malformedResponseError);
		return [];
	}
	const data = payload.data;
	if (data === void 0 || data === null) return [];
	if (!Array.isArray(data)) {
		throwMalformedImageResponse(options.malformedResponseError);
		return [];
	}
	const images = [];
	for (const [index, entry] of data.entries()) {
		if (!isRecord(entry)) {
			throwMalformedImageResponse(options.malformedResponseError);
			continue;
		}
		const image = await generatedImageAssetFromOpenAiCompatibleEntry(entry, index, options);
		if (!image) {
			throwMalformedImageResponse(options.malformedResponseError);
			continue;
		}
		images.push(image);
	}
	return images;
}`;

const CALL_OLD = `const images = parseOpenAiCompatibleImageResponse(await response.json(), {`;
const CALL_NEW = `const images = await parseOpenAiCompatibleImageResponse(await response.json(), {`;

export function patchOpenClawImageUrlSupport(filePath) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    return { patched: false, reason: 'file not found' };
  }

  let content = fs.readFileSync(absolutePath, 'utf8');

  if (content.includes('async function generatedImageAssetFromOpenAiCompatibleEntry')) {
    return { patched: false, reason: 'already patched' };
  }

  if (!content.includes(ENTRY_FN_OLD)) {
    return { patched: false, reason: 'entry function source not matched' };
  }
  if (!content.includes(PARSE_FN_OLD)) {
    return { patched: false, reason: 'parse function source not matched' };
  }
  if (!content.includes(CALL_OLD)) {
    return { patched: false, reason: 'call site source not matched' };
  }

  content = content
    .replace(ENTRY_FN_OLD, ENTRY_FN_NEW)
    .replace(PARSE_FN_OLD, PARSE_FN_NEW)
    .replace(CALL_OLD, CALL_NEW);

  fs.writeFileSync(absolutePath, content, 'utf8');
  return { patched: true };
}

export function findOpenClawImageGenerationDist(root) {
  const distDir = path.join(root, 'dist');
  if (!fs.existsSync(distDir)) return [];
  return fs
    .readdirSync(distDir)
    .filter((name) => /^image-generation-.*\.js$/.test(name))
    .map((name) => path.join(distDir, name));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const roots = process.argv.slice(2);
  if (roots.length === 0) {
    echo`Usage: node scripts/patch-openclaw-image-url.mjs <openclaw-root> [<openclaw-root> ...]`;
    process.exit(1);
  }

  for (const root of roots) {
    const files = findOpenClawImageGenerationDist(root);
    if (files.length === 0) {
      echo`⚠️  No image-generation dist file found in ${root}`;
      continue;
    }
    for (const file of files) {
      const result = patchOpenClawImageUrlSupport(file);
      if (result.patched) {
        echo`🩹 Patched ${path.relative(process.cwd(), file)} for URL image responses`;
      } else {
        echo`⏭️  Skipped ${path.relative(process.cwd(), file)}: ${result.reason}`;
      }
    }
  }
}
