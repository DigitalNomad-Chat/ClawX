#ifndef LICENSE_VERIFY_H
#define LICENSE_VERIFY_H

#include <napi.h>
#include <cstring>
#include <map>

#pragma pack(push, 1)
struct LicensePayload {
  uint8_t  version;      // 0x01
  uint16_t product_id;   // 0x0001
  uint8_t  edition;      // 0x01 standard, 0x02 pro, 0x03 enterprise
  uint32_t expiry_days;  // days since 2024-01-01, 0 = perpetual
  uint8_t  machine_fp[8];// first 8 bytes of SHA256(master fingerprint)
  uint32_t serial;       // random nonce
};
#pragma pack(pop)
static_assert(sizeof(LicensePayload) == 20, "LicensePayload must be 20 bytes");

class LicenseVerifier : public Napi::ObjectWrap<LicenseVerifier> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  LicenseVerifier(const Napi::CallbackInfo& info);

private:
  static Napi::FunctionReference constructor;

  Napi::Value Verify(const Napi::CallbackInfo& info);
  Napi::Value GetMachineFingerprint(const Napi::CallbackInfo& info);

  bool ParseLicense(const std::string& licenseStr,
                    std::vector<unsigned char>& payload,
                    std::vector<unsigned char>& signature);
  bool CheckExpiry(uint32_t expiryDays);
};

#endif
