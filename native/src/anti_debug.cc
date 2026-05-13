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
