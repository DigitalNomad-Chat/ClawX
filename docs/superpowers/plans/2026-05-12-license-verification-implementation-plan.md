# ClawX 授权验证系统实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 ClawX 实现基于 C++ N-API 的离线授权验证系统，包含机器指纹采集、RSA 签名验证、本地加密存储、代码混淆与反调试。

**Architecture:** 核心验证逻辑下沉到 C++ N-API 原生模块（跨平台 Windows/macOS），主进程通过 `electron-store` 加密存储授权状态，渲染进程提供激活 UI，构建时进行 JS 重度混淆。

**Tech Stack:** Electron 40+, Node.js N-API (node-addon-api), OpenSSL, node-gyp, javascript-obfuscator, electron-store, React + TypeScript

---

## 文件结构总览

```
ClawX/
├── native/                             # C++ N-API 模块 [新增]
│   ├── binding.gyp
│   ├── package.json
│   └── src/
│       ├── main.cc
│       ├── machine_fingerprint.cc/.h
│       ├── license_verify.cc/.h
│       ├── crypto_utils.cc/.h
│       └── anti_debug.cc/.h
│
├── electron/main/security/             # 主进程安全模块 [新增]
│   ├── anti-debug.ts
│   ├── integrity.ts
│   └── license-manager.ts
│
├── electron/main/windows/              # 激活窗口 [新增]
│   └── activation-window.ts
│
├── src/security/                       # 渲染进程安全 [新增]
│   └── anti-debug-renderer.ts
│
├── src/pages/                          # 激活页面 UI [新增]
│   └── ActivationPage.tsx
│
├── scripts/                            # 构建脚本 [新增]
│   ├── obfuscate-main.mjs
│   ├── obfuscate-renderer.mjs
│   └── generate-integrity.mjs
│
├── tools/license-generator/            # 开发者工具 [新增]
│   ├── generate.js
│   └── init-keys.sh
│
├── electron/main/index.ts              # [修改] 集成授权初始化
├── electron/preload/index.ts           # [修改] 暴露授权 API
├── package.json                        # [修改] 添加依赖与脚本
├── electron-builder.yml                # [修改] 配置 asar
└── .gitignore                          # [修改] 忽略敏感文件
```

---

## Chunk 1: C++ N-API 原生模块开发

### Task 1: 初始化 native 模块目录与构建配置

**Files:**
- Create: `native/package.json`
- Create: `native/binding.gyp`
- Create: `native/src/main.cc`

- [ ] **Step 1: 创建 native/package.json**

```json
{
  "name": "@clawx/license",
  "version": "1.0.0",
  "private": true,
  "gypfile": true,
  "scripts": {
    "build": "node-gyp rebuild",
    "build:dev": "node-gyp rebuild --debug",
    "clean": "node-gyp clean"
  },
  "dependencies": {
    "node-addon-api": "^8.3.1"
  }
}
```

- [ ] **Step 2: 创建 native/binding.gyp**

```json
{
  "targets": [
    {
      "target_name": "license",
      "sources": [
        "src/main.cc",
        "src/machine_fingerprint.cc",
        "src/license_verify.cc",
        "src/crypto_utils.cc",
        "src/anti_debug.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "conditions": [
        ["OS=='mac'", {
          "libraries": [
            "-lcrypto",
            "-framework CoreFoundation",
            "-framework IOKit"
          ],
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "10.15"
          }
        }],
        ["OS=='win'", {
          "libraries": [
            "-lcrypt32.lib",
            "-lws2_32.lib"
          ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1
            }
          }
        }]
      ]
    }
  ]
}
```

- [ ] **Step 3: 创建 native/src/main.cc（N-API 模块入口）**

```cpp
#include <napi.h>
#include "license_verify.h"

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  return LicenseVerifier::Init(env, exports);
}

NODE_API_MODULE(license, InitAll)
```

- [ ] **Step 4: 安装依赖**

Run: `cd /Volumes/KINGSTON/CodeVault/GitHub/ClawX/native && pnpm install`
Expected: node-addon-api 安装成功

- [ ] **Step 5: Commit**

```bash
git add native/
git commit -m "feat(license): init C++ N-API module structure"
```

---

### Task 2: 机器指纹采集模块（跨平台）

**Files:**
- Create: `native/src/machine_fingerprint.h`
- Create: `native/src/machine_fingerprint.cc`

- [ ] **Step 1: 创建 machine_fingerprint.h**

```cpp
#ifndef MACHINE_FINGERPRINT_H
#define MACHINE_FINGERPRINT_H

#include <napi.h>
#include <string>
#include <map>

class MachineFingerprint {
public:
  static void CollectAll(Napi::Env env, Napi::Object& out);
  static bool VerifyFactorsMatch(
    const std::map<std::string, std::string>& licensed,
    const std::map<std::string, std::string>& current
  );

private:
  static std::string HashString(const std::string& input);

#if defined(_WIN32)
  static std::string GetCpuId();
  static std::string GetDiskSerial();
  static std::string GetBoardUuid();
#elif defined(__APPLE__)
  static std::string GetCpuId();
  static std::string GetDiskSerial();
  static std::string GetBoardUuid();
#endif
  static std::string GetPrimaryMac();
  static std::string GetHostname();
};

#endif
```

- [ ] **Step 2: 创建 machine_fingerprint.cc**

```cpp
#include "machine_fingerprint.h"
#include <openssl/sha.h>
#include <sstream>
#include <iomanip>
#include <vector>
#include <cstring>

#if defined(_WIN32)
#include <windows.h>
#include <intrin.h>
#include <iphlpapi.h>
#pragma comment(lib, "iphlpapi.lib")
#elif defined(__APPLE__)
#include <sys/types.h>
#include <sys/sysctl.h>
#include <unistd.h>
#include <net/if.h>
#include <net/if_dl.h>
#include <ifaddrs.h>
#include <IOKit/IOKitLib.h>
#endif

std::string MachineFingerprint::HashString(const std::string& input) {
  unsigned char hash[SHA256_DIGEST_LENGTH];
  SHA256((const unsigned char*)input.c_str(), input.length(), hash);

  std::ostringstream oss;
  for (int i = 0; i < SHA256_DIGEST_LENGTH; i++) {
    oss << std::hex << std::setw(2) << std::setfill('0') << (int)hash[i];
  }
  return oss.str();
}

#if defined(_WIN32)
std::string MachineFingerprint::GetCpuId() {
  int cpuInfo[4] = {0};
  __cpuid(cpuInfo, 0);
  std::ostringstream oss;
  for (int i = 0; i < 4; i++) {
    oss << std::hex << cpuInfo[i];
  }
  return oss.str();
}

std::string MachineFingerprint::GetDiskSerial() {
  DWORD serialNumber = 0;
  GetVolumeInformationA("C:\\", NULL, 0, &serialNumber, NULL, NULL, NULL, 0);
  return std::to_string(serialNumber);
}

std::string MachineFingerprint::GetBoardUuid() {
  FILE* pipe = _popen("wmic csproduct get UUID /value", "r");
  if (!pipe) return "";
  char buffer[256];
  std::string result;
  while (fgets(buffer, sizeof(buffer), pipe)) {
    result += buffer;
  }
  _pclose(pipe);
  size_t pos = result.find("UUID=");
  if (pos != std::string::npos) {
    std::string uuid = result.substr(pos + 5);
    // 去除换行符和空格
    uuid.erase(std::remove_if(uuid.begin(), uuid.end(),
      [](char c) { return c == '\r' || c == '\n' || c == ' '; }), uuid.end());
    return uuid;
  }
  return "";
}

#elif defined(__APPLE__)
std::string MachineFingerprint::GetCpuId() {
  char buffer[256];
  size_t len = sizeof(buffer);
  if (sysctlbyname("machdep.cpu.brand_string", buffer, &len, NULL, 0) == 0) {
    return std::string(buffer, len - 1);
  }
  return "";
}

std::string MachineFingerprint::GetDiskSerial() {
  FILE* pipe = popen("diskutil info / | grep 'Volume UUID'", "r");
  if (!pipe) return "";
  char buffer[256];
  std::string result;
  while (fgets(buffer, sizeof(buffer), pipe)) {
    result += buffer;
  }
  pclose(pipe);
  size_t pos = result.find("Volume UUID:");
  if (pos != std::string::npos) {
    std::string uuid = result.substr(pos + 12);
    uuid.erase(std::remove_if(uuid.begin(), uuid.end(),
      [](char c) { return c == '\r' || c == '\n' || c == ' '; }), uuid.end());
    return uuid;
  }
  return "";
}

std::string MachineFingerprint::GetBoardUuid() {
  io_service_t platformExpert = IOServiceGetMatchingService(
    kIOMainPortDefault,
    IOServiceMatching("IOPlatformExpertDevice")
  );
  if (!platformExpert) return "";

  CFStringRef uuidRef = (CFStringRef)IORegistryEntryCreateCFProperty(
    platformExpert,
    CFSTR("IOPlatformUUID"),
    kCFAllocatorDefault,
    0
  );

  char buffer[256] = {0};
  if (uuidRef) {
    CFStringGetCString(uuidRef, buffer, sizeof(buffer), kCFStringEncodingUTF8);
    CFRelease(uuidRef);
  }
  IOObjectRelease(platformExpert);
  return std::string(buffer);
}
#endif

std::string MachineFingerprint::GetPrimaryMac() {
#if defined(_WIN32)
  ULONG bufLen = 0;
  GetAdaptersInfo(NULL, &bufLen);
  if (bufLen == 0) return "";
  std::vector<unsigned char> buffer(bufLen);
  PIP_ADAPTER_INFO pAdapter = (PIP_ADAPTER_INFO)buffer.data();

  if (GetAdaptersInfo(pAdapter, &bufLen) == ERROR_SUCCESS) {
    while (pAdapter) {
      if (pAdapter->Type == MIB_IF_TYPE_ETHERNET && pAdapter->AddressLength == 6) {
        std::ostringstream oss;
        for (DWORD i = 0; i < pAdapter->AddressLength; i++) {
          if (i > 0) oss << ":";
          oss << std::hex << std::setw(2) << std::setfill('0') << (int)pAdapter->Address[i];
        }
        return oss.str();
      }
      pAdapter = pAdapter->Next;
    }
  }
#elif defined(__APPLE__)
  struct ifaddrs* ifap = NULL;
  if (getifaddrs(&ifap) == 0) {
    for (struct ifaddrs* ifa = ifap; ifa; ifa = ifa->ifa_next) {
      if (ifa->ifa_addr && ifa->ifa_addr->sa_family == AF_LINK) {
        std::string name(ifa->ifa_name);
        if (name == "en0" || name == "en1") {
          struct sockaddr_dl* sdl = (struct sockaddr_dl*)ifa->ifa_addr;
          unsigned char* mac = (unsigned char*)LLADDR(sdl);
          std::ostringstream oss;
          for (int i = 0; i < 6; i++) {
            if (i > 0) oss << ":";
            oss << std::hex << std::setw(2) << std::setfill('0') << (int)mac[i];
          }
          freeifaddrs(ifap);
          return oss.str();
        }
      }
    }
    freeifaddrs(ifap);
  }
#endif
  return "";
}

std::string MachineFingerprint::GetHostname() {
  char buffer[256];
  if (gethostname(buffer, sizeof(buffer)) == 0) {
    return std::string(buffer);
  }
  return "";
}

void MachineFingerprint::CollectAll(Napi::Env env, Napi::Object& out) {
  Napi::Object factors = Napi::Object::New(env);

  std::string cpuId = GetCpuId();
  std::string diskId = GetDiskSerial();
  std::string boardUuid = GetBoardUuid();
  std::string mac = GetPrimaryMac();
  std::string hostname = GetHostname();

  factors.Set("cpuId", HashString(cpuId));
  factors.Set("diskId", HashString(diskId));
  factors.Set("boardUuid", HashString(boardUuid));
  factors.Set("biosSn", HashString(boardUuid)); // macOS 用 boardUuid 替代
  factors.Set("mac", HashString(mac));
  factors.Set("hostname", HashString(hostname));

  // 计算主指纹
  std::string combined =
    factors.Get("cpuId").As<Napi::String>().Utf8Value() +
    factors.Get("diskId").As<Napi::String>().Utf8Value() +
    factors.Get("boardUuid").As<Napi::String>().Utf8Value() +
    factors.Get("mac").As<Napi::String>().Utf8Value();

  std::string masterFp = HashString(combined);

  // 格式化为 CLAWX-XXXX-XXXX-XXXX-XXXX
  std::string displayCode = "CLAWX-";
  for (size_t i = 0; i < 16 && i < masterFp.length(); i++) {
    if (i > 0 && i % 4 == 0) displayCode += "-";
    displayCode += (char)toupper(masterFp[i]);
  }

  out.Set("fingerprint", masterFp);
  out.Set("displayCode", displayCode);
  out.Set("factors", factors);
}

bool MachineFingerprint::VerifyFactorsMatch(
  const std::map<std::string, std::string>& licensed,
  const std::map<std::string, std::string>& current
) {
  std::map<std::string, int> weights = {
    {"cpuId", 40}, {"diskId", 40}, {"boardUuid", 15},
    {"biosSn", 3}, {"mac", 1}, {"hostname", 1}
  };

  int score = 0;
  for (const auto& [key, weight] : weights) {
    auto lit = licensed.find(key);
    auto cit = current.find(key);
    if (lit != licensed.end() && cit != current.end() && lit->second == cit->second) {
      score += weight;
    }
  }

  return score >= 85;
}
```

- [ ] **Step 3: Commit**

```bash
git add native/src/machine_fingerprint.h native/src/machine_fingerprint.cc
git commit -m "feat(license): add cross-platform machine fingerprint collection"
```

---

### Task 3: 反调试模块

**Files:**
- Create: `native/src/anti_debug.h`
- Create: `native/src/anti_debug.cc`

- [ ] **Step 1: 创建 anti_debug.h**

```cpp
#ifndef ANTI_DEBUG_H
#define ANTI_DEBUG_H

class AntiDebug {
public:
  static bool IsDebuggerPresent();
};

#endif
```

- [ ] **Step 2: 创建 anti_debug.cc**

```cpp
#include "anti_debug.h"

#if defined(_WIN32)
#include <windows.h>
#include <debugapi.h>
#elif defined(__APPLE__)
#include <sys/types.h>
#include <sys/sysctl.h>
#include <unistd.h>
#include <ctime>
#endif

bool AntiDebug::IsDebuggerPresent() {
#if defined(_WIN32)
  if (::IsDebuggerPresent()) return true;

  BOOL remoteDebugger = FALSE;
  CheckRemoteDebuggerPresent(GetCurrentProcess(), &remoteDebugger);
  if (remoteDebugger) return true;

  auto start = GetTickCount64();
  volatile int dummy = 0;
  for (int i = 0; i < 1000000; i++) dummy++;
  return (GetTickCount64() - start) > 1000;

#elif defined(__APPLE__)
  struct kinfo_proc info;
  size_t info_size = sizeof(info);
  int mib[4] = { CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid() };

  if (sysctl(mib, 4, &info, &info_size, NULL, 0) == 0) {
    if (info.kp_proc.p_flag & P_TRACED) return true;
  }

  auto start = clock();
  volatile int dummy = 0;
  for (int i = 0; i < 1000000; i++) dummy++;
  return (clock() - start) * 1000 / CLOCKS_PER_SEC > 1000;
#endif
  return false;
}
```

- [ ] **Step 3: Commit**

```bash
git add native/src/anti_debug.h native/src/anti_debug.cc
git commit -m "feat(license): add anti-debug detection for Windows and macOS"
```

---

### Task 4: 公钥去混淆与加密工具

**Files:**
- Create: `native/src/crypto_utils.h`
- Create: `native/src/crypto_utils.cc`

- [ ] **Step 1: 创建 crypto_utils.h**

```cpp
#ifndef CRYPTO_UTILS_H
#define CRYPTO_UTILS_H

#include <openssl/rsa.h>
#include <string>
#include <vector>

class CryptoUtils {
public:
  static RSA* LoadDeobfuscatedPublicKey();
  static std::vector<unsigned char> Base64UrlDecode(const std::string& input);
  static std::string Base64UrlDecodeToString(const std::string& input);
  static std::string Base64UrlEncode(const unsigned char* data, size_t len);

private:
  static void DeobfuscateKey(std::vector<unsigned char>& data);
};

#endif
```

- [ ] **Step 2: 创建 crypto_utils.cc**

```cpp
#include "crypto_utils.h"
#include <openssl/pem.h>
#include <openssl/bio.h>
#include <openssl/evp.h>
#include <openssl/buffer.h>
#include <algorithm>
#include <cctype>

// 公钥经过 XOR 编码后硬编码
// 注意：这是占位数据，实际应通过 init-keys.sh 生成真实公钥的编码版本
static const unsigned char kObfPubKeyPart1[] = {
  0x00 // 占位，将由脚本替换
};
static const int kXorKey = 0x5A;

void CryptoUtils::DeobfuscateKey(std::vector<unsigned char>& data) {
  for (auto& byte : data) {
    byte ^= kXorKey;
  }
}

RSA* CryptoUtils::LoadDeobfuscatedPublicKey() {
  // 占位实现：实际构建时由脚本注入真实公钥
  // 这里返回 NULL，提示需要运行 init-keys.sh
  return NULL;
}

std::vector<unsigned char> CryptoUtils::Base64UrlDecode(const std::string& input) {
  std::string normalized = input;
  std::replace(normalized.begin(), normalized.end(), '-', '+');
  std::replace(normalized.begin(), normalized.end(), '_', '/');

  // 补齐 padding
  while (normalized.size() % 4 != 0) {
    normalized += '=';
  }

  BIO* bio = BIO_new_mem_buf(normalized.data(), normalized.size());
  BIO* b64 = BIO_new(BIO_f_base64());
  bio = BIO_push(b64, bio);
  BIO_set_flags(bio, BIO_FLAGS_BASE64_NO_NL);

  std::vector<unsigned char> output(normalized.size());
  int decodedLen = BIO_read(bio, output.data(), output.size());
  BIO_free_all(bio);

  if (decodedLen > 0) {
    output.resize(decodedLen);
  } else {
    output.clear();
  }
  return output;
}

std::string CryptoUtils::Base64UrlDecodeToString(const std::string& input) {
  auto bytes = Base64UrlDecode(input);
  return std::string(bytes.begin(), bytes.end());
}

std::string CryptoUtils::Base64UrlEncode(const unsigned char* data, size_t len) {
  BIO* bio = BIO_new(BIO_s_mem());
  BIO* b64 = BIO_new(BIO_f_base64());
  bio = BIO_push(b64, bio);
  BIO_set_flags(bio, BIO_FLAGS_BASE64_NO_NL);
  BIO_write(bio, data, len);
  BIO_flush(bio);

  BUF_MEM* bufferPtr;
  BIO_get_mem_ptr(bio, &bufferPtr);
  std::string result(bufferPtr->data, bufferPtr->length);
  BIO_free_all(bio);

  // 转为 base64url
  std::replace(result.begin(), result.end(), '+', '-');
  std::replace(result.begin(), result.end(), '/', '_');
  result.erase(std::remove(result.begin(), result.end(), '='), result.end());

  return result;
}
```

- [ ] **Step 3: Commit**

```bash
git add native/src/crypto_utils.h native/src/crypto_utils.cc
git commit -m "feat(license): add crypto utils with base64url and key deobfuscation stubs"
```

---

### Task 5: License 验证核心模块

**Files:**
- Create: `native/src/license_verify.h`
- Create: `native/src/license_verify.cc`

- [ ] **Step 1: 创建 license_verify.h**

```cpp
#ifndef LICENSE_VERIFY_H
#define LICENSE_VERIFY_H

#include <napi.h>
#include <string>
#include <map>

class LicenseVerifier : public Napi::ObjectWrap<LicenseVerifier> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  LicenseVerifier(const Napi::CallbackInfo& info);

private:
  static Napi::FunctionReference constructor;

  Napi::Value Verify(const Napi::CallbackInfo& info);
  Napi::Value GetMachineFingerprint(const Napi::CallbackInfo& info);

  bool ParseLicense(const std::string& licenseStr,
                    std::string& payloadB64,
                    std::string& signature);
  std::map<std::string, std::string> ParsePayloadFactors(const std::string& payloadJson);
};

#endif
```

- [ ] **Step 2: 创建 license_verify.cc**

```cpp
#include "license_verify.h"
#include "crypto_utils.h"
#include "machine_fingerprint.h"
#include "anti_debug.h"

#include <openssl/rsa.h>
#include <openssl/sha.h>
#include <openssl/err.h>
#include <cstring>
#include <algorithm>

Napi::FunctionReference LicenseVerifier::constructor;

Napi::Object LicenseVerifier::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "LicenseVerifier", {
    InstanceMethod("verify", &LicenseVerifier::Verify),
    InstanceMethod("getMachineFingerprint", &LicenseVerifier::GetMachineFingerprint),
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();
  exports.Set("LicenseVerifier", func);
  return exports;
}

LicenseVerifier::LicenseVerifier(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<LicenseVerifier>(info) {}

Napi::Value LicenseVerifier::GetMachineFingerprint(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (AntiDebug::IsDebuggerPresent()) {
    Napi::Error::New(env, "Security violation: debugger detected").ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Object result = Napi::Object::New(env);
  MachineFingerprint::CollectAll(env, result);
  return result;
}

bool LicenseVerifier::ParseLicense(const std::string& licenseStr,
                                   std::string& payloadB64,
                                   std::string& signature) {
  const std::string prefix = "CLAWX-LICENSE-";
  if (licenseStr.find(prefix) != 0) return false;

  size_t dotPos = licenseStr.rfind('.');
  if (dotPos == std::string::npos || dotPos <= prefix.length()) return false;

  payloadB64 = licenseStr.substr(prefix.length(), dotPos - prefix.length());
  signature = licenseStr.substr(dotPos + 1);
  return !payloadB64.empty() && !signature.empty();
}

std::map<std::string, std::string> LicenseVerifier::ParsePayloadFactors(const std::string& payloadJson) {
  std::map<std::string, std::string> result;

  // 简单 JSON 解析（提取 factors_hash 中的字段）
  // 实际项目中可集成轻量级 JSON 库如 nlohmann/json
  // 这里使用字符串搜索作为最小实现
  const std::string keys[] = {"cpuId", "diskId", "boardUuid", "biosSn", "mac", "hostname"};

  for (const auto& key : keys) {
    std::string searchKey = "\"" + key + "\"";
    size_t keyPos = payloadJson.find(searchKey);
    if (keyPos != std::string::npos) {
      size_t valStart = payloadJson.find('"', keyPos + searchKey.length());
      if (valStart != std::string::npos) {
        size_t valEnd = payloadJson.find('"', valStart + 1);
        if (valEnd != std::string::npos) {
          result[key] = payloadJson.substr(valStart + 1, valEnd - valStart - 1);
        }
      }
    }
  }

  return result;
}

Napi::Value LicenseVerifier::Verify(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsObject()) {
    Napi::TypeError::New(env, "Expected (licenseString: string, factors: object)").ThrowAsJavaScriptException();
    return env.Null();
  }

  // 反调试检测
  if (AntiDebug::IsDebuggerPresent()) {
    Napi::Error::New(env, "Security violation: debugger detected").ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string licenseString = info[0].As<Napi::String>().Utf8Value();
  Napi::Object currentFactorsObj = info[1].As<Napi::Object>();

  // 解析 License
  std::string payloadB64, signatureB64;
  if (!ParseLicense(licenseString, payloadB64, signatureB64)) {
    return Napi::Boolean::New(env, false);
  }

  // 加载公钥
  RSA* rsa = CryptoUtils::LoadDeobfuscatedPublicKey();
  if (!rsa) {
    Napi::Error::New(env, "Failed to load verification key").ThrowAsJavaScriptException();
    return env.Null();
  }

  // RSA-SHA256 签名验证
  unsigned char digest[SHA256_DIGEST_LENGTH];
  SHA256((const unsigned char*)payloadB64.c_str(), payloadB64.length(), digest);

  std::vector<unsigned char> signature = CryptoUtils::Base64UrlDecode(signatureB64);

  int verifyResult = RSA_verify(
    NID_sha256,
    digest, SHA256_DIGEST_LENGTH,
    signature.data(), signature.size(),
    rsa
  );

  RSA_free(rsa);
  OPENSSL_cleanse(digest, sizeof(digest));

  if (verifyResult != 1) {
    return Napi::Boolean::New(env, false);
  }

  // 解析 Payload 并提取 factors
  std::string payloadJson = CryptoUtils::Base64UrlDecodeToString(payloadB64);
  std::map<std::string, std::string> licensedFactors = ParsePayloadFactors(payloadJson);

  // 提取当前机器 factors
  std::map<std::string, std::string> currentFactors;
  Napi::Array keys = currentFactorsObj.GetPropertyNames();
  for (uint32_t i = 0; i < keys.Length(); i++) {
    std::string key = keys.Get(i).As<Napi::String>().Utf8Value();
    if (currentFactorsObj.Has(key)) {
      currentFactors[key] = currentFactorsObj.Get(key).As<Napi::String>().Utf8Value();
    }
  }

  // 机器指纹匹配
  bool machineMatch = MachineFingerprint::VerifyFactorsMatch(licensedFactors, currentFactors);

  return Napi::Boolean::New(env, machineMatch);
}
```

- [ ] **Step 3: Commit**

```bash
git add native/src/license_verify.h native/src/license_verify.cc
git commit -m "feat(license): add license verification core with RSA-SHA256 and machine matching"
```

---

## Chunk 2: 授权管理器与本地存储

### Task 6: 主进程授权管理器

**Files:**
- Create: `electron/main/security/license-manager.ts`
- Modify: `electron/main/index.ts`

- [ ] **Step 1: 创建 license-manager.ts**

```typescript
import { app } from 'electron';
import Store from 'electron-store';
import crypto from 'crypto';
import path from 'path';

// 动态加载原生模块（构建后才存在）
let LicenseVerifier: any;
try {
  const nativeModule = require(path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'native',
    'build',
    'Release',
    'license.node'
  ));
  LicenseVerifier = nativeModule.LicenseVerifier;
} catch (e) {
  // 开发模式：从项目根目录加载
  try {
    const nativeModule = require(path.join(app.getAppPath(), '..', '..', 'native', 'build', 'Release', 'license.node'));
    LicenseVerifier = nativeModule.LicenseVerifier;
  } catch (devErr) {
    console.warn('Native license module not found, running in dev mode without license check');
    LicenseVerifier = null;
  }
}

interface LicensePayload {
  v: number;
  machine: string;
  type: string;
  iat: string;
  exp?: string;
  uid: string;
  factors_hash: Record<string, string>;
}

function deriveStorageKey(machineFingerprint: string): string {
  const salt = 'ClawX-Fixed-Salt-v1';
  return crypto.pbkdf2Sync(machineFingerprint + salt, salt, 100000, 32, 'sha256').toString('hex');
}

class LicenseManager {
  private store: Store;
  private verifier: any;
  private cachedFingerprint: any = null;

  constructor() {
    this.initStore();
    if (LicenseVerifier) {
      this.verifier = new LicenseVerifier();
    }
  }

  private initStore() {
    const fingerprint = this.getMachineFingerprint();
    const encryptionKey = deriveStorageKey(fingerprint.fingerprint);

    this.store = new Store({
      name: 'license',
      encryptionKey,
    });
  }

  getMachineFingerprint(): { fingerprint: string; displayCode: string; factors: Record<string, string> } {
    if (this.cachedFingerprint) return this.cachedFingerprint;

    if (!this.verifier) {
      // 开发模式返回占位
      return {
        fingerprint: 'dev-mode-fingerprint',
        displayCode: 'CLAWX-DEV-MODE-XXXX',
        factors: {},
      };
    }

    this.cachedFingerprint = this.verifier.getMachineFingerprint();
    return this.cachedFingerprint;
  }

  activateLicense(licenseString: string): { success: boolean; reason?: string } {
    if (!this.verifier) {
      return { success: true }; // 开发模式跳过
    }

    const machine = this.getMachineFingerprint();

    try {
      const isValid = this.verifier.verify(licenseString, machine.factors);
      if (!isValid) {
        return { success: false, reason: 'INVALID_LICENSE' };
      }

      this.store.set('license', licenseString);
      this.store.set('activated_at', Date.now());
      this.store.set('last_check', Date.now());

      return { success: true };
    } catch (err: any) {
      return { success: false, reason: err.message || 'VERIFICATION_ERROR' };
    }
  }

  checkLicense(): { valid: boolean; reason?: string; machineCode?: string } {
    if (!this.verifier) {
      return { valid: true }; // 开发模式
    }

    const license = this.store.get('license') as string | undefined;
    if (!license) {
      return { valid: false, reason: 'NO_LICENSE', machineCode: this.getMachineFingerprint().displayCode };
    }

    const machine = this.getMachineFingerprint();

    try {
      const isValid = this.verifier.verify(license, machine.factors);
      if (!isValid) {
        return { valid: false, reason: 'LICENSE_INVALID', machineCode: machine.displayCode };
      }

      this.store.set('last_check', Date.now());
      return { valid: true };
    } catch (err: any) {
      return { valid: false, reason: err.message || 'CHECK_ERROR', machineCode: machine.displayCode };
    }
  }

  clearLicense(): void {
    this.store.clear();
  }
}

export const licenseManager = new LicenseManager();
```

- [ ] **Step 2: 修改 electron/main/index.ts（在 app ready 时检查授权）**

在 `app.whenReady()` 或主窗口创建之前添加授权检查：

```typescript
import { licenseManager } from './security/license-manager';

// 在 app.whenReady() 中：
app.whenReady().then(async () => {
  // ... 现有代码 ...

  // 授权检查
  const licenseStatus = licenseManager.checkLicense();
  if (!licenseStatus.valid) {
    // 未授权，打开激活窗口
    createActivationWindow(licenseStatus.machineCode);
    return;
  }

  // 已授权，创建主窗口
  createMainWindow();
});
```

- [ ] **Step 3: Commit**

```bash
git add electron/main/security/license-manager.ts electron/main/index.ts
git commit -m "feat(license): add license manager with encrypted local storage"
```

---

### Task 7: 激活窗口

**Files:**
- Create: `electron/main/windows/activation-window.ts`

- [ ] **Step 1: 创建 activation-window.ts**

```typescript
import { BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { licenseManager } from '../security/license-manager';

let activationWindow: BrowserWindow | null = null;

export function createActivationWindow(machineCode: string = '') {
  if (activationWindow) {
    activationWindow.focus();
    return;
  }

  activationWindow = new BrowserWindow({
    width: 600,
    height: 500,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'ClawX 激活',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 加载激活页面（后续由渲染进程路由处理）
  if (process.env.VITE_DEV_SERVER_URL) {
    activationWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/activation`);
  } else {
    activationWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: 'activation',
    });
  }

  // 开发模式可打开 DevTools
  // activationWindow.webContents.openDevTools();

  activationWindow.on('closed', () => {
    activationWindow = null;
  });

  // 发送机器码到渲染进程
  activationWindow.webContents.on('did-finish-load', () => {
    activationWindow?.webContents.send('license:machine-code', machineCode);
  });
}

// IPC 处理
ipcMain.handle('license:activate', async (_event, licenseCode: string) => {
  const result = licenseManager.activateLicense(licenseCode);
  if (result.success) {
    activationWindow?.close();
    // 通知主进程创建主窗口
    // 这里需要暴露一个回调或事件给主入口
  }
  return result;
});

ipcMain.handle('license:get-machine-code', () => {
  return licenseManager.getMachineFingerprint().displayCode;
});
```

- [ ] **Step 2: Commit**

```bash
git add electron/main/windows/activation-window.ts
git commit -m "feat(license): add activation window"
```

---

### Task 8: 预加载脚本暴露 API

**Files:**
- Modify: `electron/preload/index.ts`

- [ ] **Step 1: 在 preload 中添加 license API**

```typescript
import { contextBridge, ipcRenderer } from 'electron';

// 现有 preload 代码...

// 新增授权相关 API
contextBridge.exposeInMainWorld('licenseAPI', {
  getMachineCode: () => ipcRenderer.invoke('license:get-machine-code'),
  activate: (code: string) => ipcRenderer.invoke('license:activate', code),
  onMachineCode: (callback: (code: string) => void) => {
    ipcRenderer.on('license:machine-code', (_event, code) => callback(code));
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add electron/preload/index.ts
git commit -m "feat(license): expose license API in preload"
```

---

## Chunk 3: 渲染进程 UI 与反调试

### Task 9: 渲染进程反调试

**Files:**
- Create: `src/security/anti-debug-renderer.ts`

- [ ] **Step 1: 创建 anti-debug-renderer.ts**

```typescript
export function initRendererAntiDebug() {
  // 检测 DevTools 打开
  setInterval(() => {
    const threshold = 160;
    const widthThreshold = window.outerWidth - window.innerWidth > threshold;
    const heightThreshold = window.outerHeight - window.innerHeight > threshold;

    if (widthThreshold || heightThreshold) {
      document.body.innerHTML = '';
      window.location.reload();
    }
  }, 1000);

  // 禁用右键菜单
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  // 禁用 F12、Ctrl+Shift+I、Ctrl+Shift+J
  window.addEventListener('keydown', (e) => {
    if (
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
      (e.ctrlKey && e.key === 'U')
    ) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/security/anti-debug-renderer.ts
git commit -m "feat(license): add renderer anti-debug protection"
```

---

### Task 10: 激活页面 UI

**Files:**
- Create: `src/pages/ActivationPage.tsx`

- [ ] **Step 1: 创建 ActivationPage.tsx**

```tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface WindowWithLicenseAPI extends Window {
  licenseAPI?: {
    getMachineCode: () => Promise<string>;
    activate: (code: string) => Promise<{ success: boolean; reason?: string }>;
    onMachineCode: (callback: (code: string) => void) => void;
  };
}

const ActivationPage: React.FC = () => {
  const [machineCode, setMachineCode] = useState('');
  const [licenseCode, setLicenseCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const win = window as unknown as WindowWithLicenseAPI;

    if (win.licenseAPI) {
      win.licenseAPI.getMachineCode().then(setMachineCode);
      win.licenseAPI.onMachineCode(setMachineCode);
    }
  }, []);

  const handleActivate = async () => {
    if (!licenseCode.trim()) {
      setError('请输入授权码');
      return;
    }

    setLoading(true);
    setError('');

    const win = window as unknown as WindowWithLicenseAPI;
    if (!win.licenseAPI) {
      setError('授权模块未加载');
      setLoading(false);
      return;
    }

    try {
      const result = await win.licenseAPI.activate(licenseCode.trim());
      if (result.success) {
        // 激活成功，刷新页面或导航到主应用
        window.location.href = '/';
      } else {
        setError(getErrorMessage(result.reason));
      }
    } catch (err) {
      setError('验证失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const getErrorMessage = (reason?: string) => {
    switch (reason) {
      case 'INVALID_LICENSE':
        return '授权码无效或已过期';
      case 'MACHINE_MISMATCH':
        return '授权码与当前设备不匹配';
      case 'VERIFICATION_ERROR':
        return '验证过程出错，请联系技术支持';
      default:
        return '验证失败，请检查授权码';
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(machineCode);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">ClawX 激活</h1>
          <p className="text-gray-400">请输入您的授权码以激活 ClawX</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <label className="block text-sm text-gray-400 mb-2">您的机器码</label>
          <div className="flex gap-2">
            <code className="flex-1 bg-gray-900 rounded px-3 py-2 text-sm font-mono text-green-400">
              {machineCode || '加载中...'}
            </code>
            <button
              onClick={handleCopy}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition"
            >
              复制
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            请将机器码发送给管理员获取授权码
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <label className="block text-sm text-gray-400 mb-2">授权码</label>
          <textarea
            value={licenseCode}
            onChange={(e) => setLicenseCode(e.target.value)}
            placeholder="CLAWX-LICENSE-..."
            className="w-full bg-gray-900 rounded px-3 py-2 text-sm font-mono text-white placeholder-gray-600 resize-none h-24"
          />
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleActivate}
          disabled={loading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 rounded-lg font-medium transition"
        >
          {loading ? '验证中...' : '激活'}
        </button>
      </div>
    </div>
  );
};

export default ActivationPage;
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/ActivationPage.tsx
git commit -m "feat(license): add activation page UI"
```

---

### Task 11: 路由配置

**Files:**
- Modify: `src/App.tsx` 或路由配置文件

- [ ] **Step 1: 添加激活路由**

在 React Router 配置中添加：

```tsx
import ActivationPage from './pages/ActivationPage';

// 在路由配置中：
<Route path="/activation" element={<ActivationPage />} />
```

- [ ] **Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat(license): add activation route"
```

---

## Chunk 4: 构建脚本与混淆

### Task 12: 混淆脚本

**Files:**
- Create: `scripts/obfuscate-main.mjs`
- Create: `scripts/obfuscate-renderer.mjs`

- [ ] **Step 1: 创建 obfuscate-main.mjs**

```javascript
import JavaScriptObfuscator from 'javascript-obfuscator';
import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

const obfuscatorOptions = {
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 1.0,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  stringArray: true,
  stringArrayThreshold: 1.0,
  stringArrayEncoding: ['rc4', 'base64'],
  stringArrayRotate: true,
  stringArrayShuffle: true,
  identifierNamesGenerator: 'mangled',
  renameGlobals: true,
  numbersToExpressions: true,
  disableConsoleOutput: true,
  debugProtection: true,
  debugProtectionInterval: 2000,
  selfDefending: true,
  transformObjectKeys: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
};

const files = globSync('dist-electron/**/*.js', { absolute: true });

for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  const result = JavaScriptObfuscator.obfuscate(code, obfuscatorOptions);
  fs.writeFileSync(file, result.getObfuscatedCode());
  console.log(`Obfuscated: ${path.relative(process.cwd(), file)}`);
}

console.log(`Obfuscated ${files.length} files.`);
```

- [ ] **Step 2: 创建 obfuscate-renderer.mjs**

```javascript
import JavaScriptObfuscator from 'javascript-obfuscator';
import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

const rendererOptions = {
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.7,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  stringArray: true,
  stringArrayThreshold: 0.8,
  stringArrayEncoding: ['base64'],
  identifierNamesGenerator: 'mangled',
  disableConsoleOutput: true,
  selfDefending: true,
};

const files = globSync('dist/assets/**/*.js', { absolute: true });

for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  const result = JavaScriptObfuscator.obfuscate(code, rendererOptions);
  fs.writeFileSync(file, result.getObfuscatedCode());
  console.log(`Obfuscated: ${path.relative(process.cwd(), file)}`);
}

console.log(`Obfuscated ${files.length} files.`);
```

- [ ] **Step 3: Commit**

```bash
git add scripts/obfuscate-main.mjs scripts/obfuscate-renderer.mjs
git commit -m "feat(build): add JS obfuscation scripts for main and renderer"
```

---

### Task 13: 完整性校验脚本

**Files:**
- Create: `scripts/generate-integrity.mjs`
- Create: `electron/main/security/integrity.ts`

- [ ] **Step 1: 创建 generate-integrity.mjs**

```javascript
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

const files = [
  'dist-electron/main/index.js',
  'dist-electron/preload/index.js',
];

const hashes = {};

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  hashes[path.basename(file)] = `sha256:${hash}`;
}

// 写入主进程代码可读取的位置
fs.writeFileSync(
  'dist-electron/main/security/integrity-hashes.json',
  JSON.stringify(hashes, null, 2)
);

console.log('Integrity hashes generated:', hashes);
```

- [ ] **Step 2: 创建 integrity.ts**

```typescript
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

let EXPECTED_HASHES: Record<string, string> = {};

try {
  const hashFile = path.join(__dirname, 'integrity-hashes.json');
  if (fs.existsSync(hashFile)) {
    EXPECTED_HASHES = JSON.parse(fs.readFileSync(hashFile, 'utf8'));
  }
} catch {
  // 开发模式可能没有哈希文件
}

export function verifyIntegrity(): boolean {
  if (Object.keys(EXPECTED_HASHES).length === 0) return true;

  const asarPath = process.resourcesPath;

  for (const [relativePath, expectedHash] of Object.entries(EXPECTED_HASHES)) {
    const filePath = path.join(asarPath, 'app.asar', 'dist-electron', relativePath);

    if (!fs.existsSync(filePath)) {
      console.error(`Integrity check failed: ${relativePath} missing`);
      return false;
    }

    const content = fs.readFileSync(filePath);
    const actualHash = 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');

    if (actualHash !== expectedHash) {
      console.error(`Integrity check failed: ${relativePath} modified`);
      return false;
    }
  }

  return true;
}
```

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-integrity.mjs electron/main/security/integrity.ts
git commit -m "feat(build): add file integrity verification"
```

---

### Task 14: package.json 脚本配置

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 添加依赖和脚本**

在 `package.json` 的 `dependencies` 中添加：

```json
{
  "dependencies": {
    "javascript-obfuscator": "^4.1.1"
  }
}
```

在 `scripts` 中添加：

```json
{
  "scripts": {
    "native:build": "cd native && node-gyp rebuild",
    "native:build:dev": "cd native && node-gyp rebuild --debug",
    "obfuscate": "node scripts/obfuscate-main.mjs && node scripts/obfuscate-renderer.mjs",
    "generate-integrity": "node scripts/generate-integrity.mjs"
  }
}
```

在 `build` 脚本中插入混淆步骤：

```json
{
  "scripts": {
    "build": "node scripts/generate-ext-bridge.mjs && pnpm run build:vite && zx scripts/bundle-openclaw.mjs && ... && node scripts/run-electron-builder.mjs",
    "build:secure": "pnpm run build:vite && pnpm run obfuscate && pnpm run generate-integrity && pnpm run native:build && node scripts/run-electron-builder.mjs"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "feat(build): add native build and obfuscation scripts"
```

---

## Chunk 5: 开发者授权工具

### Task 15: 授权生成工具

**Files:**
- Create: `tools/license-generator/generate.js`
- Create: `tools/license-generator/init-keys.sh`

- [ ] **Step 1: 创建 generate.js**

```javascript
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const PRIVATE_KEY_PATH = path.join(__dirname, 'keys', 'private.pem');
const PUBLIC_KEY_PATH = path.join(__dirname, 'keys', 'public.pem');

function loadPrivateKey() {
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error('错误：未找到私钥文件。请先运行 init-keys.sh 生成密钥对。');
    process.exit(1);
  }
  return fs.readFileSync(PRIVATE_KEY_PATH);
}

function generateLicense(machineCode, type = 'pro', expDate = null) {
  const privateKey = loadPrivateKey();

  const payload = {
    v: 1,
    machine: machineCode,
    type: type,
    iat: new Date().toISOString(),
    exp: expDate,
    uid: `lic_${crypto.randomBytes(8).toString('hex')}`,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(payloadB64);
  const signature = sign.sign(privateKey, 'base64url');

  return `CLAWX-LICENSE-${payloadB64}.${signature}`;
}

function generateObfuscatedKeyCode() {
  if (!fs.existsSync(PUBLIC_KEY_PATH)) {
    console.error('错误：未找到公钥文件。');
    process.exit(1);
  }

  const pubKey = fs.readFileSync(PUBLIC_KEY_PATH);
  const xorKey = 0x5A;

  // XOR 编码公钥
  const encoded = Buffer.alloc(pubKey.length);
  for (let i = 0; i < pubKey.length; i++) {
    encoded[i] = pubKey[i] ^ xorKey;
  }

  // 生成 C++ 数组代码
  const hexArray = Array.from(encoded).map(b => `0x${b.toString(16).padStart(2, '0')}`);

  // 分段（每段约 500 字节）
  const chunkSize = 500;
  const chunks = [];
  for (let i = 0; i < hexArray.length; i += chunkSize) {
    chunks.push(hexArray.slice(i, i + chunkSize));
  }

  console.log('\n// 将以下内容替换到 native/src/crypto_utils.cc 中的占位符:\n');

  chunks.forEach((chunk, idx) => {
    console.log(`static const unsigned char kObfPubKeyPart${idx + 1}[] = {`);
    console.log('  ' + chunk.join(', '));
    console.log('};');
    console.log();
  });

  console.log(`// 公钥总长度: ${pubKey.length} 字节`);
  console.log(`// 编码后长度: ${encoded.length} 字节`);
  console.log(`// XOR Key: 0x${xorKey.toString(16).toUpperCase()}`);
}

// CLI
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const command = process.argv[2];

if (command === 'encode-key') {
  generateObfuscatedKeyCode();
  rl.close();
} else {
  console.log('=== ClawX 授权码生成工具 ===\n');

  rl.question('请输入用户机器码 (如: CLAWX-XXXX-XXXX-XXXX): ', (machineCode) => {
    if (!machineCode || !machineCode.startsWith('CLAWX-')) {
      console.error('错误：机器码格式无效');
      rl.close();
      return;
    }

    rl.question('授权类型 (pro/enterprise/trial) [默认: pro]: ', (type) => {
      const licenseType = type.trim() || 'pro';

      rl.question('过期日期 (YYYY-MM-DD，留空为永久): ', (exp) => {
        const expDate = exp.trim() || null;

        const license = generateLicense(machineCode, licenseType, expDate);

        console.log('\n=== 生成的授权码 ===');
        console.log(license);
        console.log('\n请将以上授权码发送给用户。');

        // 记录
        const record = {
          uid: JSON.parse(Buffer.from(license.split('.')[0].replace('CLAWX-LICENSE-', ''), 'base64url').toString()).uid,
          machine: machineCode,
          type: licenseType,
          exp: expDate,
          createdAt: new Date().toISOString(),
          license: license,
        };

        const dbPath = path.join(__dirname, 'issued-licenses.json');
        const db = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf8')) : [];
        db.push(record);
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        console.log('已记录到 issued-licenses.json');

        rl.close();
      });
    });
  });
}
```

- [ ] **Step 2: 创建 init-keys.sh**

```bash
#!/bin/bash
set -e

cd "$(dirname "$0")"
mkdir -p keys

echo "生成 RSA-2048 密钥对..."

# 私钥（开发者保管，用于签名）
openssl genrsa -out keys/private.pem 2048

# 公钥（嵌入客户端，用于验证）
openssl rsa -in keys/private.pem -pubout -out keys/public.pem

echo ""
echo "密钥对已生成："
echo "  私钥: keys/private.pem (绝不可泄露、不可提交到 git)"
echo "  公钥: keys/public.pem (需嵌入 ClawX 客户端)"
echo ""

# 生成 C++ 可用的编码公钥
echo "生成 C++ 编码公钥..."
node generate.js encode-key > keys/obfuscated_key.cc.txt

echo "编码公钥已保存到 keys/obfuscated_key.cc.txt"
echo "请将文件内容替换 native/src/crypto_utils.cc 中的占位符。"
```

- [ ] **Step 3: Commit**

```bash
git add tools/license-generator/
git commit -m "feat(tools): add license generator and key initialization scripts"
```

---

## Chunk 6: 反调试主进程模块

### Task 16: 主进程反调试

**Files:**
- Create: `electron/main/security/anti-debug.ts`

- [ ] **Step 1: 创建 anti-debug.ts**

```typescript
import { app } from 'electron';

export function initAntiDebug() {
  // 时间差检测 debugger
  setInterval(() => {
    const start = Date.now();
    // 密集计算
    let dummy = 0;
    for (let i = 0; i < 1000000; i++) dummy++;
    const elapsed = Date.now() - start;

    if (elapsed > 1000) {
      console.error('Security violation: debugger detected');
      app.quit();
    }
  }, 3000);

  // Windows: 检测可疑进程
  if (process.platform === 'win32') {
    checkSuspiciousProcesses();
    setInterval(checkSuspiciousProcesses, 5000);
  }
}

function checkSuspiciousProcesses() {
  if (process.platform !== 'win32') return;

  try {
    const { execSync } = require('child_process');
    const processes = execSync('tasklist /FO CSV').toString().toLowerCase();
    const suspicious = [
      'x64dbg', 'cheatengine', 'frida',
      'dnspy', 'ilspy', 'processhacker',
    ];

    for (const name of suspicious) {
      if (processes.includes(name)) {
        console.error(`Security violation: suspicious process ${name} detected`);
        app.quit();
      }
    }
  } catch (e) {
    // ignore
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/main/security/anti-debug.ts
git commit -m "feat(license): add main process anti-debug protection"
```

---

## Chunk 7: 最终集成与测试

### Task 17: 主入口集成

**Files:**
- Modify: `electron/main/index.ts`

- [ ] **Step 1: 在主入口中集成所有安全模块**

```typescript
import { initAntiDebug } from './security/anti-debug';
import { verifyIntegrity } from './security/integrity';
import { licenseManager } from './security/license-manager';
import { createActivationWindow } from './windows/activation-window';

// 在 app.whenReady() 之前初始化反调试
initAntiDebug();

app.whenReady().then(async () => {
  // 完整性校验
  if (!verifyIntegrity()) {
    console.error('Application integrity check failed');
    app.quit();
    return;
  }

  // 授权检查
  const licenseStatus = licenseManager.checkLicense();
  if (!licenseStatus.valid) {
    createActivationWindow(licenseStatus.machineCode);
  } else {
    createMainWindow();
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add electron/main/index.ts
git commit -m "feat(license): integrate license check into main entry"
```

---

### Task 18: .gitignore 更新

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: 追加敏感文件忽略**

```gitignore
# License system sensitive files
tools/license-generator/keys/
*.pem
issued-licenses.json
native/build/
native/*.node
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore(git): ignore license system sensitive files"
```

---

### Task 19: electron-builder 配置更新

**Files:**
- Modify: `electron-builder.yml`

- [ ] **Step 1: 更新 asarUnpack 配置**

在现有 `electron-builder.yml` 中添加/修改：

```yaml
asar: true
asarUnpack:
  - 'node_modules/sharp/**/*'
  - 'node_modules/node-machine-id/**/*'
  - 'native/build/Release/*.node'  # C++ 原生模块不解包

files:
  - 'dist-electron/**/*'
  - 'dist/**/*'
  - '!**/*.map'
```

- [ ] **Step 2: Commit**

```bash
git add electron-builder.yml
git commit -m "chore(build): configure asar to unpack native license module"
```

---

## 测试与验证

### 测试步骤

1. **安装依赖**：`cd native && pnpm install`
2. **生成密钥**：`cd tools/license-generator && bash init-keys.sh`
3. **替换公钥**：将 `keys/obfuscated_key.cc.txt` 内容替换到 `native/src/crypto_utils.cc`
4. **编译原生模块**：`pnpm run native:build`
5. **开发模式运行**：`pnpm dev`（开发模式跳过授权检查）
6. **生产模式测试**：
   - `pnpm run build`
   - `pnpm run obfuscate`
   - 生成 license：`node tools/license-generator/generate.js`
   - 在激活页面输入 license 测试
7. **跨平台测试**：分别在 Windows 和 macOS 上编译运行

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-12-license-verification-implementation-plan.md`. Ready to execute?**
