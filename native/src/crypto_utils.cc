#include "crypto_utils.h"
#include <openssl/pem.h>
#include <openssl/bio.h>
#include <algorithm>
#include <vector>

// Base58 Bitcoin alphabet
static const char kBase58Alphabet[] =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// 公钥经过 XOR 编码后硬编码（Ed25519, 113 bytes PEM）
static const unsigned char kObfPubKey[] = {
  0x77, 0x77, 0x77, 0x77, 0x77, 0x18, 0x1f, 0x1d, 0x13, 0x14, 0x7a, 0x0a, 0x0f, 0x18, 0x16, 0x13,
  0x19, 0x7a, 0x11, 0x1f, 0x03, 0x77, 0x77, 0x77, 0x77, 0x77, 0x50, 0x17, 0x19, 0x35, 0x2d, 0x18,
  0x0b, 0x03, 0x1e, 0x11, 0x68, 0x0c, 0x2d, 0x1b, 0x23, 0x1f, 0x1b, 0x71, 0x34, 0x6e, 0x6c, 0x13,
  0x11, 0x63, 0x62, 0x3e, 0x3e, 0x0e, 0x18, 0x6c, 0x71, 0x75, 0x29, 0x2c, 0x12, 0x38, 0x69, 0x12,
  0x08, 0x0f, 0x2d, 0x3c, 0x15, 0x28, 0x09, 0x36, 0x00, 0x09, 0x19, 0x0b, 0x33, 0x69, 0x0f, 0x36,
  0x68, 0x29, 0x32, 0x68, 0x08, 0x2d, 0x67, 0x50, 0x77, 0x77, 0x77, 0x77, 0x77, 0x1f, 0x14, 0x1e,
  0x7a, 0x0a, 0x0f, 0x18, 0x16, 0x13, 0x19, 0x7a, 0x11, 0x1f, 0x03, 0x77, 0x77, 0x77, 0x77, 0x77,
  0x50
};
static const int kXorKey = 0x5A;

void CryptoUtils::DeobfuscateKey(std::vector<unsigned char>& data) {
  for (auto& byte : data) {
    byte ^= kXorKey;
  }
}

EVP_PKEY* CryptoUtils::LoadDeobfuscatedPublicKey() {
  std::vector<unsigned char> decoded;
  for (size_t i = 0; i < sizeof(kObfPubKey); i++) {
    decoded.push_back(kObfPubKey[i] ^ kXorKey);
  }

  BIO* bio = BIO_new_mem_buf(decoded.data(), decoded.size());
  EVP_PKEY* pkey = PEM_read_bio_PUBKEY(bio, NULL, NULL, NULL);

  OPENSSL_cleanse(decoded.data(), decoded.size());
  BIO_free(bio);

  return pkey;
}

bool CryptoUtils::Base58Encode(const std::vector<unsigned char>& data, std::string& out) {
  if (data.empty()) {
    out.clear();
    return true;
  }

  // Count leading zeros
  size_t leadingZeros = 0;
  while (leadingZeros < data.size() && data[leadingZeros] == 0) {
    leadingZeros++;
  }

  // Convert to base58
  std::vector<unsigned char> digits;
  digits.reserve(data.size() * 2);

  for (size_t i = 0; i < data.size(); i++) {
    int carry = data[i];
    for (size_t j = 0; j < digits.size(); j++) {
      carry += 256 * digits[j];
      digits[j] = carry % 58;
      carry /= 58;
    }
    while (carry > 0) {
      digits.push_back(carry % 58);
      carry /= 58;
    }
  }

  out.clear();
  out.reserve(leadingZeros + digits.size());
  for (size_t i = 0; i < leadingZeros; i++) {
    out += kBase58Alphabet[0]; // '1'
  }
  for (auto it = digits.rbegin(); it != digits.rend(); ++it) {
    out += kBase58Alphabet[*it];
  }
  return true;
}

bool CryptoUtils::Base58Decode(const std::string& input, std::vector<unsigned char>& out) {
  if (input.empty()) {
    out.clear();
    return true;
  }

  // Count leading '1's
  size_t leadingOnes = 0;
  while (leadingOnes < input.size() && input[leadingOnes] == '1') {
    leadingOnes++;
  }

  std::vector<unsigned char> result;
  result.reserve(input.size());

  for (size_t i = leadingOnes; i < input.size(); i++) {
    const char* p = strchr(kBase58Alphabet, input[i]);
    if (!p) return false; // Invalid character
    int digit = p - kBase58Alphabet;

    int carry = digit;
    for (size_t j = 0; j < result.size(); j++) {
      carry += 58 * result[j];
      result[j] = carry % 256;
      carry /= 256;
    }
    while (carry > 0) {
      result.push_back(carry % 256);
      carry /= 256;
    }
  }

  // Add leading zeros
  out.clear();
  out.reserve(leadingOnes + result.size());
  for (size_t i = 0; i < leadingOnes; i++) {
    out.push_back(0);
  }
  for (auto it = result.rbegin(); it != result.rend(); ++it) {
    out.push_back(*it);
  }
  return true;
}

bool CryptoUtils::Ed25519Verify(EVP_PKEY* pkey,
                                const unsigned char* msg, size_t msgLen,
                                const unsigned char* sig, size_t sigLen) {
  EVP_MD_CTX* mdctx = EVP_MD_CTX_new();
  if (!mdctx) return false;

  // Ed25519 uses NULL digest (internally SHA-512)
  if (EVP_DigestVerifyInit(mdctx, NULL, NULL, NULL, pkey) != 1) {
    EVP_MD_CTX_free(mdctx);
    return false;
  }

  int result = EVP_DigestVerify(mdctx, sig, sigLen, msg, msgLen);
  EVP_MD_CTX_free(mdctx);
  return result == 1;
}
