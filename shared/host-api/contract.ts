/**
 * v0.4.9 P0 — Host API contract scaffold (types only).
 *
 * Selective adapter surface from upstream 581981f2 (#1102). Signatures are
 * intentionally loose placeholders so P0 stays compile-safe without migrating
 * call sites, enabling hostInvoke, or switching IPC/HTTP transports.
 *
 * Real payload/result types land in P2–P3 when services register against the
 * HostApiRegistry. Do not import this module from production call sites yet.
 */

/** Loose scaffold action — tightened per-module in later phases. */
export type HostScaffoldAction = (...args: never[]) => unknown;

/**
 * Core Host API modules aligned with upstream HostApiContract keys.
 * Each module lists at least one action name so `HostApiAction<M>` is usable.
 */
export type HostApiContract = {
  app: {
    openClawDoctor: (payload?: unknown) => unknown;
  };
  openclaw: {
    status: () => unknown;
    getDir: () => unknown;
    getConfigDir: () => unknown;
    getSkillsDir: () => unknown;
    getCliCommand: () => unknown;
  };
  shell: {
    openExternal: (payload?: unknown) => unknown;
    showItemInFolder: (payload?: unknown) => unknown;
    openPath: (payload?: unknown) => unknown;
  };
  dialog: {
    open: (payload?: unknown) => unknown;
    save: (payload?: unknown) => unknown;
    message: (payload?: unknown) => unknown;
  };
  window: {
    syncTrafficLightPosition: (payload?: unknown) => unknown;
    minimize: () => unknown;
    maximize: () => unknown;
    close: () => unknown;
    isMaximized: () => unknown;
  };
  updates: {
    getStatus: () => unknown;
    check: () => unknown;
    download: () => unknown;
    install: () => unknown;
    setChannel: (payload?: unknown) => unknown;
    setAutoDownload: (payload?: unknown) => unknown;
  };
  uv: {
    check: () => unknown;
    installAll: () => unknown;
  };
  settings: {
    getAll: () => unknown;
    get: (payload?: unknown) => unknown;
    set: (payload?: unknown) => unknown;
    setMany: (payload?: unknown) => unknown;
    reset: () => unknown;
  };
  gateway: {
    status: () => unknown;
    isConnected: () => unknown;
    start: () => unknown;
    stop: () => unknown;
    restart: () => unknown;
    health: () => unknown;
    rpc: (payload?: unknown) => unknown;
  };
  logs: {
    getRecent: (payload?: unknown) => unknown;
    readFile: (payload?: unknown) => unknown;
    getFilePath: () => unknown;
    getDir: () => unknown;
    listFiles: () => unknown;
  };
  channels: {
    listConfigured: () => unknown;
    getConfig: (payload?: unknown) => unknown;
    saveConfig: (payload?: unknown) => unknown;
  };
  agents: {
    list: () => unknown;
  };
  diagnostics: {
    report: () => unknown;
  };
  providers: {
    list: () => unknown;
    listAccounts: () => unknown;
  };
  files: {
    listDir: (payload?: unknown) => unknown;
    readText: (payload?: unknown) => unknown;
  };
  media: {
    getThumbnails: (payload?: unknown) => unknown;
    saveImage: (payload?: unknown) => unknown;
  };
  sessions: {
    listSummaries: (payload?: unknown) => unknown;
    getHistory: (payload?: unknown) => unknown;
  };
  chat: {
    sendWithMedia: (payload?: unknown) => unknown;
  };
  cron: {
    list: () => unknown;
    create: (payload?: unknown) => unknown;
    update: (payload?: unknown) => unknown;
    delete: (payload?: unknown) => unknown;
  };
  skills: {
    status: () => unknown;
    updateConfig: (payload?: unknown) => unknown;
  };
  usage: {
    recentTokenHistory: (payload?: unknown) => unknown;
  };

  /**
   * CLAWDOCK extension points (optional).
   * Filled in later phases (P1 kernel bridge, P3 member/office-tools/desensitize).
   * Not present on upstream 581981f2 contract.
   */
  member?: {
    getUser: () => unknown;
    activate: (payload?: unknown) => unknown;
  };
  officeTools?: {
    stats: () => unknown;
  };
  desensitize?: {
    transform: (payload?: unknown) => unknown;
  };
  kernel?: {
    subscribe: (sessionId: string) => unknown;
    unsubscribe: (sessionId: string) => unknown;
    approvalRespond: (...args: unknown[]) => unknown;
  };
};

export type HostApiModule = keyof HostApiContract & string;

export type HostApiAction<M extends HostApiModule> = keyof NonNullable<HostApiContract[M]> & string;

export type HostApiFunction<
  M extends HostApiModule,
  A extends HostApiAction<M>,
> = NonNullable<HostApiContract[M]>[A] extends (...args: infer Args) => infer Result
  ? (...args: Args) => Result
  : never;

export type HostApiPayload<
  M extends HostApiModule,
  A extends HostApiAction<M>,
> = Parameters<HostApiFunction<M, A>> extends []
  ? undefined
  : Parameters<HostApiFunction<M, A>>[0];

export type HostApiResult<
  M extends HostApiModule,
  A extends HostApiAction<M>,
> = Awaited<ReturnType<HostApiFunction<M, A>>>;

export type HostApiPayloadArgs<
  M extends HostApiModule,
  A extends HostApiAction<M>,
> = Parameters<HostApiFunction<M, A>> extends []
  ? []
  : undefined extends HostApiPayload<M, A>
    ? [payload?: HostApiPayload<M, A>]
    : [payload: HostApiPayload<M, A>];
