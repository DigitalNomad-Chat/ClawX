#include <napi.h>
#include "license_verify.h"

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  return LicenseVerifier::Init(env, exports);
}

NODE_API_MODULE(license, InitAll)
