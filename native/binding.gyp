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
          "include_dirs": [
            "/opt/homebrew/opt/openssl@3/include"
          ],
          "libraries": [
            "-L/opt/homebrew/opt/openssl@3/lib",
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
