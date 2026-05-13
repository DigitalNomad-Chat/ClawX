#!/bin/bash
set -e

cd "$(dirname "$0")"
mkdir -p keys

echo "生成 RSA-2048 密钥对..."

openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem

echo ""
echo "密钥对已生成："
echo "  私钥: keys/private.pem (绝不可泄露、不可提交到 git)"
echo "  公钥: keys/public.pem (需嵌入 ClawX 客户端)"
echo ""

echo "生成 C++ 编码公钥..."
node generate.js encode-key > keys/obfuscated_key.cc.txt

echo "编码公钥已保存到 keys/obfuscated_key.cc.txt"
echo "请将文件内容替换 native/src/crypto_utils.cc 中的占位符。"
