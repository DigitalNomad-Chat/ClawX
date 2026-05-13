#ifndef MACHINE_FINGERPRINT_H
#define MACHINE_FINGERPRINT_H

#include <napi.h>
#include <string>
#include <map>
#include <vector>

class MachineFingerprint {
public:
  static void CollectAll(Napi::Env env, Napi::Object& out);
  static bool VerifyFactorsMatch(
    const std::map<std::string, std::string>& licensed,
    const std::map<std::string, std::string>& current
  );
  // Compute raw master fingerprint bytes (SHA256 of combined factor hashes)
  static std::vector<unsigned char> ComputeMasterFingerprint();

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
