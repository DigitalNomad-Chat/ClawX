#ifndef CRYPTO_UTILS_H
#define CRYPTO_UTILS_H

#include <openssl/evp.h>
#include <string>
#include <vector>

class CryptoUtils {
public:
  static EVP_PKEY* LoadDeobfuscatedPublicKey();
  static bool Base58Encode(const std::vector<unsigned char>& data, std::string& out);
  static bool Base58Decode(const std::string& input, std::vector<unsigned char>& out);
  static bool Ed25519Verify(EVP_PKEY* pkey,
                            const unsigned char* msg, size_t msgLen,
                            const unsigned char* sig, size_t sigLen);

private:
  static void DeobfuscateKey(std::vector<unsigned char>& data);
};

#endif
