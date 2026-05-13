#include "machine_fingerprint.h"
#include <openssl/sha.h>
#include <sstream>
#include <iomanip>
#include <vector>
#include <cstring>
#include <algorithm>
#include <cctype>

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
    kIOMasterPortDefault,
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

std::vector<unsigned char> MachineFingerprint::ComputeMasterFingerprint() {
  std::string cpuHash    = HashString(GetCpuId());
  std::string diskHash   = HashString(GetDiskSerial());
  std::string boardHash  = HashString(GetBoardUuid());
  std::string macHash    = HashString(GetPrimaryMac());

  std::string combined = cpuHash + diskHash + boardHash + macHash;

  unsigned char hash[SHA256_DIGEST_LENGTH];
  SHA256((const unsigned char*)combined.c_str(), combined.length(), hash);

  return std::vector<unsigned char>(hash, hash + SHA256_DIGEST_LENGTH);
}

void MachineFingerprint::CollectAll(Napi::Env env, Napi::Object& out) {
  Napi::Object factors = Napi::Object::New(env);

  std::string cpuHash    = HashString(GetCpuId());
  std::string diskHash   = HashString(GetDiskSerial());
  std::string boardHash  = HashString(GetBoardUuid());
  std::string macHash    = HashString(GetPrimaryMac());

  factors.Set("cpuId",    cpuHash);
  factors.Set("diskId",   diskHash);
  factors.Set("boardUuid",boardHash);
  factors.Set("biosSn",   boardHash);
  factors.Set("mac",      macHash);
  factors.Set("hostname", HashString(GetHostname()));

  auto masterFpBytes = ComputeMasterFingerprint();

  std::ostringstream oss;
  for (auto b : masterFpBytes) {
    oss << std::hex << std::setw(2) << std::setfill('0') << (int)b;
  }
  std::string masterFp = oss.str();

  std::string displayCode;
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
