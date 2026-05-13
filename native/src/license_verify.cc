#include "license_verify.h"
#include "crypto_utils.h"
#include "machine_fingerprint.h"
#include "anti_debug.h"

#include <openssl/evp.h>
#include <cstring>
#include <algorithm>
#include <ctime>

#if defined(__APPLE__) || defined(__linux__)
#include <arpa/inet.h>
#elif defined(_WIN32)
#include <winsock2.h>
#pragma comment(lib, "ws2_32.lib")
#endif

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
                                   std::vector<unsigned char>& payload,
                                   std::vector<unsigned char>& signature) {
  size_t dotPos = licenseStr.rfind('.');
  if (dotPos == std::string::npos || dotPos == 0) return false;

  std::string payloadB58 = licenseStr.substr(0, dotPos);
  std::string sigB58 = licenseStr.substr(dotPos + 1);

  if (!CryptoUtils::Base58Decode(payloadB58, payload)) return false;
  if (!CryptoUtils::Base58Decode(sigB58, signature)) return false;

  return payload.size() == sizeof(LicensePayload) && signature.size() == 64;
}

bool LicenseVerifier::CheckExpiry(uint32_t expiryDays) {
  if (expiryDays == 0) return true; // perpetual

  struct tm base = {};
  base.tm_year = 2024 - 1900;
  base.tm_mon = 0;
  base.tm_mday = 1;
  base.tm_hour = 0;
  base.tm_min = 0;
  base.tm_sec = 0;
  base.tm_isdst = -1;

  time_t baseTime = mktime(&base);
  time_t now = time(NULL);
  if (baseTime == (time_t)-1) return false;

  double diff = difftime(now, baseTime);
  uint32_t currentDays = (uint32_t)(diff / (24.0 * 3600.0));

  return currentDays <= expiryDays;
}

Napi::Value LicenseVerifier::Verify(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsObject()) {
    Napi::TypeError::New(env, "Expected (licenseString: string, factors: object)").ThrowAsJavaScriptException();
    return env.Null();
  }

  if (AntiDebug::IsDebuggerPresent()) {
    Napi::Error::New(env, "Security violation: debugger detected").ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string licenseString = info[0].As<Napi::String>().Utf8Value();

  std::vector<unsigned char> payloadBytes;
  std::vector<unsigned char> signatureBytes;
  if (!ParseLicense(licenseString, payloadBytes, signatureBytes)) {
    return Napi::Boolean::New(env, false);
  }

  // Parse payload
  LicensePayload lp;
  memcpy(&lp, payloadBytes.data(), sizeof(lp));

  // Check version and product ID
  if (lp.version != 0x01) {
    return Napi::Boolean::New(env, false);
  }
  uint16_t productId = ntohs(lp.product_id);
  if (productId != 0x0001) {
    return Napi::Boolean::New(env, false);
  }

  // Check expiry
  uint32_t expiryDays = ntohl(lp.expiry_days);
  if (!CheckExpiry(expiryDays)) {
    return Napi::Boolean::New(env, false);
  }

  // Verify Ed25519 signature
  EVP_PKEY* pkey = CryptoUtils::LoadDeobfuscatedPublicKey();
  if (!pkey) {
    Napi::Error::New(env, "Failed to load verification key").ThrowAsJavaScriptException();
    return env.Null();
  }

  bool sigValid = CryptoUtils::Ed25519Verify(
    pkey,
    payloadBytes.data(), payloadBytes.size(),
    signatureBytes.data(), signatureBytes.size()
  );

  EVP_PKEY_free(pkey);

  if (!sigValid) {
    return Napi::Boolean::New(env, false);
  }

  // Check machine fingerprint (first 8 bytes of master SHA256)
  std::vector<unsigned char> currentFp = MachineFingerprint::ComputeMasterFingerprint();
  if (currentFp.size() < 8) {
    return Napi::Boolean::New(env, false);
  }

  bool fpMatch = (memcmp(lp.machine_fp, currentFp.data(), 8) == 0);

  return Napi::Boolean::New(env, fpMatch);
}
