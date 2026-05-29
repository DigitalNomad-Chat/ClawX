/**
 * Channel Type Definitions
 * Types for messaging channels (WhatsApp, Telegram, etc.)
 */

/**
 * Supported channel types
 */
export type ChannelType =
  | 'whatsapp'
  | 'wechat'
  | 'dingtalk'
  | 'telegram'
  | 'discord'
  | 'signal'
  | 'feishu'
  | 'wecom'
  | 'imessage'
  | 'matrix'
  | 'line'
  | 'msteams'
  | 'googlechat'
  | 'mattermost'
  | 'qqbot'
  | 'slack';

/**
 * Channel connection status
 */
export type ChannelStatus = 'connected' | 'disconnected' | 'connecting' | 'degraded' | 'error';

/**
 * Channel connection type
 */
export type ChannelConnectionType = 'token' | 'qr' | 'oauth' | 'webhook';

/**
 * Channel data structure
 */
export interface Channel {
  id: string;
  type: ChannelType;
  name: string;
  status: ChannelStatus;
  accountId?: string;
  lastActivity?: string;
  error?: string;
  avatar?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Channel configuration field definition
 */
export interface ChannelConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select';
  placeholder?: string;
  required?: boolean;
  envVar?: string;
  description?: string;
  options?: { value: string; label: string }[];
}

/**
 * Channel settings field (for access/connection/advanced panels)
 */
export interface ChannelSettingsField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select' | 'textarea' | 'checkbox' | 'number' | 'custom';
  placeholder?: string;
  description?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string | boolean | number;
}

/**
 * Channel settings group (access policy / connection mode / advanced)
 */
export interface ChannelSettingsGroup {
  id: 'access' | 'connection' | 'advanced';
  label: string;
  fields: ChannelSettingsField[];
}

/**
 * Channel metadata with configuration info
 */
export interface ChannelMeta {
  id: ChannelType;
  name: string;
  icon: string;
  description: string;
  connectionType: ChannelConnectionType;
  docsUrl: string;
  configFields: ChannelConfigField[];
  instructions: string[];
  isPlugin?: boolean;
  settingsGroups?: ChannelSettingsGroup[];
}

/**
 * Channel icons mapping
 */
export const CHANNEL_ICONS: Record<ChannelType, string> = {
  whatsapp: '📱',
  wechat: '💬',
  dingtalk: '💬',
  telegram: '✈️',
  discord: '🎮',
  signal: '🔒',
  feishu: '🐦',
  wecom: '💼',
  imessage: '💬',
  matrix: '🔗',
  line: '🟢',
  msteams: '👔',
  googlechat: '💭',
  mattermost: '💠',
  qqbot: '🐧',
  slack: '#',
};

/**
 * Channel display names
 */
export const CHANNEL_NAMES: Record<ChannelType, string> = {
  whatsapp: 'WhatsApp',
  wechat: 'WeChat',
  dingtalk: 'DingTalk',
  telegram: 'Telegram',
  discord: 'Discord',
  signal: 'Signal',
  feishu: 'Feishu / Lark',
  wecom: 'WeCom',
  imessage: 'iMessage',
  matrix: 'Matrix',
  line: 'LINE',
  msteams: 'Microsoft Teams',
  googlechat: 'Google Chat',
  mattermost: 'Mattermost',
  qqbot: 'QQ Bot',
  slack: 'Slack',
};

/**
 * Channel metadata with configuration information
 */
export const CHANNEL_META: Record<ChannelType, ChannelMeta> = {
  qqbot: {
    id: 'qqbot',
    name: 'QQ Bot',
    icon: '🐧',
    description: 'channels:meta.qqbot.description',
    connectionType: 'token',
    docsUrl: 'channels:meta.qqbot.docsUrl',
    configFields: [
      {
        key: 'appId',
        label: 'channels:meta.qqbot.fields.appId.label',
        type: 'text',
        placeholder: 'channels:meta.qqbot.fields.appId.placeholder',
        required: true,
      },
      {
        key: 'clientSecret',
        label: 'channels:meta.qqbot.fields.clientSecret.label',
        type: 'password',
        placeholder: 'channels:meta.qqbot.fields.clientSecret.placeholder',
        required: true,
      },
    ],
    instructions: [
      'channels:meta.qqbot.instructions.0',
      'channels:meta.qqbot.instructions.1',
      'channels:meta.qqbot.instructions.2',
    ],
    settingsGroups: [
      {
        id: 'access',
        label: 'channels:settings.access',
        fields: [
          {
            key: 'allowFrom',
            label: 'channels:fields.allowFrom.label',
            type: 'textarea',
            placeholder: 'channels:fields.allowFrom.placeholder',
            description: 'channels:fields.allowFrom.description',
          },
          {
            key: 'groupPolicy',
            label: 'channels:fields.groupPolicy.label',
            type: 'select',
            options: [
              { value: 'open', label: 'channels:fields.groupPolicy.open' },
              { value: 'allowlist', label: 'channels:fields.groupPolicy.allowlist' },
              { value: 'disabled', label: 'channels:fields.groupPolicy.disabled' },
            ],
            defaultValue: 'open',
          },
          {
            key: 'groupAllowFrom',
            label: 'channels:fields.groupAllowFrom.label',
            type: 'textarea',
            placeholder: 'channels:fields.groupAllowFrom.placeholder',
          },
        ],
      },
      {
        id: 'advanced',
        label: 'channels:settings.advanced',
        fields: [
          {
            key: 'systemPrompt',
            label: 'channels:fields.systemPrompt.label',
            type: 'textarea',
            placeholder: 'channels:fields.systemPrompt.placeholder',
          },
          {
            key: 'markdownSupport',
            label: 'channels:fields.markdownSupport.label',
            type: 'checkbox',
            defaultValue: true,
          },
          {
            key: 'imageServerBaseUrl',
            label: 'channels:fields.imageServerBaseUrl.label',
            type: 'text',
            placeholder: 'channels:fields.imageServerBaseUrl.placeholder',
          },
        ],
      },
    ],
  },
  dingtalk: {
    id: 'dingtalk',
    name: 'DingTalk',
    icon: '💬',
    description: 'channels:meta.dingtalk.description',
    connectionType: 'token',
    docsUrl: 'channels:meta.dingtalk.docsUrl',
    configFields: [
      {
        key: 'clientId',
        label: 'channels:meta.dingtalk.fields.clientId.label',
        type: 'text',
        placeholder: 'channels:meta.dingtalk.fields.clientId.placeholder',
        required: true,
      },
      {
        key: 'clientSecret',
        label: 'channels:meta.dingtalk.fields.clientSecret.label',
        type: 'password',
        placeholder: 'channels:meta.dingtalk.fields.clientSecret.placeholder',
        required: true,
      },
    ],
    instructions: [
      'channels:meta.dingtalk.instructions.0',
      'channels:meta.dingtalk.instructions.1',
      'channels:meta.dingtalk.instructions.2',
    ],
    isPlugin: true,
    settingsGroups: [
      {
        id: 'access',
        label: 'channels:settings.access',
        fields: [
          {
            key: 'dmPolicy',
            label: 'channels:fields.dmPolicy.label',
            type: 'select',
            options: [
              { value: 'open', label: 'channels:fields.dmPolicy.open' },
              { value: 'pairing', label: 'channels:fields.dmPolicy.pairing' },
              { value: 'allowlist', label: 'channels:fields.dmPolicy.allowlist' },
            ],
            defaultValue: 'open',
          },
          {
            key: 'allowFrom',
            label: 'channels:fields.allowFrom.label',
            type: 'textarea',
            placeholder: 'channels:fields.allowFrom.placeholder',
            description: 'channels:fields.allowFrom.description',
          },
          {
            key: 'groupPolicy',
            label: 'channels:fields.groupPolicy.label',
            type: 'select',
            options: [
              { value: 'open', label: 'channels:fields.groupPolicy.open' },
              { value: 'allowlist', label: 'channels:fields.groupPolicy.allowlist' },
            ],
            defaultValue: 'open',
          },
          {
            key: 'groups',
            label: 'channels:fields.groups.label',
            type: 'textarea',
            placeholder: 'channels:fields.groups.placeholder',
          },
          {
            key: 'cardTemplateId',
            label: 'channels:fields.cardTemplateId.label',
            type: 'text',
            placeholder: 'channels:fields.cardTemplateId.placeholder',
          },
          {
            key: 'cardTemplateKey',
            label: 'channels:fields.cardTemplateKey.label',
            type: 'text',
            placeholder: 'channels:fields.cardTemplateKey.placeholder',
          },
          {
            key: 'proactivePermissionHint',
            label: 'channels:fields.proactivePermissionHint.label',
            type: 'checkbox',
            defaultValue: false,
          },
        ],
      },
      {
        id: 'connection',
        label: 'channels:settings.connection',
        fields: [
          {
            key: 'maxConnectionAttempts',
            label: 'channels:fields.maxConnectionAttempts.label',
            type: 'number',
            placeholder: 'channels:fields.maxConnectionAttempts.placeholder',
          },
          {
            key: 'initialReconnectDelay',
            label: 'channels:fields.initialReconnectDelay.label',
            type: 'number',
            placeholder: 'channels:fields.initialReconnectDelay.placeholder',
          },
          {
            key: 'maxReconnectDelay',
            label: 'channels:fields.maxReconnectDelay.label',
            type: 'number',
            placeholder: 'channels:fields.maxReconnectDelay.placeholder',
          },
          {
            key: 'reconnectJitter',
            label: 'channels:fields.reconnectJitter.label',
            type: 'number',
            placeholder: 'channels:fields.reconnectJitter.placeholder',
          },
          {
            key: 'maxReconnectCycles',
            label: 'channels:fields.maxReconnectCycles.label',
            type: 'number',
            placeholder: 'channels:fields.maxReconnectCycles.placeholder',
          },
          {
            key: 'useConnectionManager',
            label: 'channels:fields.useConnectionManager.label',
            type: 'checkbox',
            defaultValue: false,
          },
        ],
      },
      {
        id: 'advanced',
        label: 'channels:settings.advanced',
        fields: [
          {
            key: 'showThinking',
            label: 'channels:fields.showThinking.label',
            type: 'checkbox',
            defaultValue: true,
          },
          {
            key: 'debug',
            label: 'channels:fields.debug.label',
            type: 'checkbox',
            defaultValue: false,
          },
          {
            key: 'messageType',
            label: 'channels:fields.messageType.label',
            type: 'select',
            options: [
              { value: 'markdown', label: 'channels:fields.messageType.markdown' },
              { value: 'card', label: 'channels:fields.messageType.card' },
            ],
            defaultValue: 'markdown',
          },
          {
            key: 'mediaMaxMb',
            label: 'channels:fields.mediaMaxMb.label',
            type: 'number',
            placeholder: 'channels:fields.mediaMaxMb.placeholder',
          },
          {
            key: 'mediaUrlAllowlist',
            label: 'channels:fields.mediaUrlAllowlist.label',
            type: 'textarea',
            placeholder: 'channels:fields.mediaUrlAllowlist.placeholder',
          },
          {
            key: 'streaming',
            label: 'channels:fields.streaming.label',
            type: 'checkbox',
            defaultValue: false,
          },
          {
            key: 'network',
            label: 'channels:fields.network.label',
            type: 'textarea',
            placeholder: 'channels:fields.network.placeholder',
          },
        ],
      },
    ],
  },
  wecom: {
    id: 'wecom',
    name: 'WeCom',
    icon: '💼',
    description: 'channels:meta.wecom.description',
    connectionType: 'token',
    docsUrl: 'channels:meta.wecom.docsUrl',
    configFields: [
      {
        key: 'botId',
        label: 'channels:meta.wecom.fields.botId.label',
        type: 'text',
        placeholder: 'channels:meta.wecom.fields.botId.placeholder',
        required: true,
      },
      {
        key: 'secret',
        label: 'channels:meta.wecom.fields.secret.label',
        type: 'password',
        placeholder: 'channels:meta.wecom.fields.secret.placeholder',
        required: true,
      },
    ],
    instructions: [
      'channels:meta.wecom.instructions.0',
      'channels:meta.wecom.instructions.1',
      'channels:meta.wecom.instructions.2',
    ],
    isPlugin: true,
    settingsGroups: [
      {
        id: 'access',
        label: 'channels:settings.access',
        fields: [
          {
            key: 'dmPolicy',
            label: 'channels:fields.dmPolicy.label',
            type: 'select',
            options: [
              { value: 'pairing', label: 'channels:fields.dmPolicy.pairing' },
              { value: 'allowlist', label: 'channels:fields.dmPolicy.allowlist' },
              { value: 'open', label: 'channels:fields.dmPolicy.open' },
              { value: 'disabled', label: 'channels:fields.dmPolicy.disabled' },
            ],
            defaultValue: 'pairing',
          },
          {
            key: 'allowFrom',
            label: 'channels:fields.allowFrom.label',
            type: 'textarea',
            placeholder: 'channels:fields.allowFrom.placeholder',
            description: 'channels:fields.allowFrom.description',
          },
          {
            key: 'groupPolicy',
            label: 'channels:fields.groupPolicy.label',
            type: 'select',
            options: [
              { value: 'allowlist', label: 'channels:fields.groupPolicy.allowlist' },
              { value: 'open', label: 'channels:fields.groupPolicy.open' },
              { value: 'disabled', label: 'channels:fields.groupPolicy.disabled' },
            ],
            defaultValue: 'open',
          },
          {
            key: 'groupAllowFrom',
            label: 'channels:fields.groupAllowFrom.label',
            type: 'textarea',
            placeholder: 'channels:fields.groupAllowFrom.placeholder',
          },
        ],
      },
      {
        id: 'connection',
        label: 'channels:settings.connection',
        fields: [
          {
            key: 'websocketUrl',
            label: 'channels:fields.websocketUrl.label',
            type: 'text',
            placeholder: 'channels:fields.websocketUrl.placeholder',
          },
        ],
      },
      {
        id: 'advanced',
        label: 'channels:settings.advanced',
        fields: [
          {
            key: 'proxy',
            label: 'channels:fields.proxy.label',
            type: 'text',
            placeholder: 'channels:fields.proxy.placeholder',
          },
          {
            key: 'streaming',
            label: 'channels:fields.streaming.label',
            type: 'checkbox',
            defaultValue: false,
          },
          {
            key: 'sendThinkingMessage',
            label: 'channels:fields.sendThinkingMessage.label',
            type: 'checkbox',
            defaultValue: false,
          },
          {
            key: 'network',
            label: 'channels:fields.network.label',
            type: 'textarea',
            placeholder: 'channels:fields.network.placeholder',
          },
        ],
      },
    ],
  },
  telegram: {
    id: 'telegram',
    name: 'Telegram',
    icon: '✈️',
    description: 'channels:meta.telegram.description',
    connectionType: 'token',
    docsUrl: 'channels:meta.telegram.docsUrl',
    configFields: [
      {
        key: 'botToken',
        label: 'channels:meta.telegram.fields.botToken.label',
        type: 'password',
        placeholder: 'channels:meta.telegram.fields.botToken.placeholder',
        required: true,
        envVar: 'TELEGRAM_BOT_TOKEN',
      },
      {
        key: 'allowedUsers',
        label: 'channels:meta.telegram.fields.allowedUsers.label',
        type: 'text',
        placeholder: 'channels:meta.telegram.fields.allowedUsers.placeholder',
        required: true,
      },
    ],
    instructions: [
      'channels:meta.telegram.instructions.0',
      'channels:meta.telegram.instructions.1',
      'channels:meta.telegram.instructions.2',
      'channels:meta.telegram.instructions.3',
      'channels:meta.telegram.instructions.4',
    ],
    settingsGroups: [
      {
        id: 'access',
        label: 'channels:settings.access',
        fields: [
          {
            key: 'dmPolicy',
            label: 'channels:fields.dmPolicy.label',
            type: 'select',
            options: [
              { value: 'pairing', label: 'channels:fields.dmPolicy.pairing' },
              { value: 'allowlist', label: 'channels:fields.dmPolicy.allowlist' },
              { value: 'open', label: 'channels:fields.dmPolicy.open' },
              { value: 'disabled', label: 'channels:fields.dmPolicy.disabled' },
            ],
            defaultValue: 'pairing',
          },
          {
            key: 'allowFrom',
            label: 'channels:fields.allowFrom.label',
            type: 'textarea',
            placeholder: 'channels:fields.allowFrom.placeholder',
            description: 'channels:fields.allowFrom.description',
          },
          {
            key: 'groupPolicy',
            label: 'channels:fields.groupPolicy.label',
            type: 'select',
            options: [
              { value: 'allowlist', label: 'channels:fields.groupPolicy.allowlist' },
              { value: 'open', label: 'channels:fields.groupPolicy.open' },
              { value: 'disabled', label: 'channels:fields.groupPolicy.disabled' },
            ],
            defaultValue: 'allowlist',
          },
          {
            key: 'groupAllowFrom',
            label: 'channels:fields.groupAllowFrom.label',
            type: 'textarea',
            placeholder: 'channels:fields.groupAllowFrom.placeholder',
          },
        ],
      },
      {
        id: 'advanced',
        label: 'channels:settings.advanced',
        fields: [
          {
            key: 'proxy',
            label: 'channels:fields.proxy.label',
            type: 'text',
            placeholder: 'channels:fields.proxy.placeholder',
          },
          {
            key: 'streaming',
            label: 'channels:fields.streaming.label',
            type: 'checkbox',
            defaultValue: false,
          },
          {
            key: 'network',
            label: 'channels:fields.network.label',
            type: 'textarea',
            placeholder: 'channels:fields.network.placeholder',
          },
        ],
      },
    ],
  },
  discord: {
    id: 'discord',
    name: 'Discord',
    icon: '🎮',
    description: 'channels:meta.discord.description',
    connectionType: 'token',
    docsUrl: 'channels:meta.discord.docsUrl',
    configFields: [
      {
        key: 'token',
        label: 'channels:meta.discord.fields.token.label',
        type: 'password',
        placeholder: 'channels:meta.discord.fields.token.placeholder',
        required: true,
        envVar: 'DISCORD_BOT_TOKEN',
      },
      {
        key: 'guildId',
        label: 'channels:meta.discord.fields.guildId.label',
        type: 'text',
        placeholder: 'channels:meta.discord.fields.guildId.placeholder',
        description: 'channels:meta.discord.fields.guildId.description',
      },
      {
        key: 'channelId',
        label: 'channels:meta.discord.fields.channelId.label',
        type: 'text',
        placeholder: 'channels:meta.discord.fields.channelId.placeholder',
        description: 'channels:meta.discord.fields.channelId.description',
      },
    ],
    instructions: [
      'channels:meta.discord.instructions.0',
      'channels:meta.discord.instructions.1',
      'channels:meta.discord.instructions.2',
      'channels:meta.discord.instructions.3',
      'channels:meta.discord.instructions.4',
      'channels:meta.discord.instructions.5',
    ],
    settingsGroups: [
      {
        id: 'access',
        label: 'channels:settings.access',
        fields: [
          {
            key: 'dmPolicy',
            label: 'channels:fields.dmPolicy.label',
            type: 'select',
            options: [
              { value: 'pairing', label: 'channels:fields.dmPolicy.pairing' },
              { value: 'allowlist', label: 'channels:fields.dmPolicy.allowlist' },
              { value: 'open', label: 'channels:fields.dmPolicy.open' },
              { value: 'disabled', label: 'channels:fields.dmPolicy.disabled' },
            ],
            defaultValue: 'pairing',
          },
          {
            key: 'groupPolicy',
            label: 'channels:fields.groupPolicy.label',
            type: 'select',
            options: [
              { value: 'allowlist', label: 'channels:fields.groupPolicy.allowlist' },
              { value: 'open', label: 'channels:fields.groupPolicy.open' },
              { value: 'disabled', label: 'channels:fields.groupPolicy.disabled' },
            ],
            defaultValue: 'allowlist',
          },
          {
            key: 'allowFrom',
            label: 'channels:fields.allowFrom.label',
            type: 'textarea',
            placeholder: 'channels:fields.allowFrom.placeholder',
          },
        ],
      },
      {
        id: 'advanced',
        label: 'channels:settings.advanced',
        fields: [
          {
            key: 'proxy',
            label: 'channels:fields.proxy.label',
            type: 'text',
            placeholder: 'channels:fields.proxy.placeholder',
          },
          {
            key: 'streaming',
            label: 'channels:fields.streaming.label',
            type: 'checkbox',
            defaultValue: false,
          },
          {
            key: 'network',
            label: 'channels:fields.network.label',
            type: 'textarea',
            placeholder: 'channels:fields.network.placeholder',
          },
        ],
      },
    ],
  },

  whatsapp: {
    id: 'whatsapp',
    name: 'WhatsApp',
    icon: '📱',
    description: 'channels:meta.whatsapp.description',
    connectionType: 'qr',
    docsUrl: 'channels:meta.whatsapp.docsUrl',
    configFields: [],
    instructions: [
      'channels:meta.whatsapp.instructions.0',
      'channels:meta.whatsapp.instructions.1',
      'channels:meta.whatsapp.instructions.2',
      'channels:meta.whatsapp.instructions.3',
    ],
    settingsGroups: [
      {
        id: 'access',
        label: 'channels:settings.access',
        fields: [
          {
            key: 'dmPolicy',
            label: 'channels:fields.dmPolicy.label',
            type: 'select',
            options: [
              { value: 'pairing', label: 'channels:fields.dmPolicy.pairing' },
              { value: 'allowlist', label: 'channels:fields.dmPolicy.allowlist' },
              { value: 'open', label: 'channels:fields.dmPolicy.open' },
              { value: 'disabled', label: 'channels:fields.dmPolicy.disabled' },
            ],
            defaultValue: 'pairing',
          },
          {
            key: 'allowFrom',
            label: 'channels:fields.allowFrom.label',
            type: 'textarea',
            placeholder: 'channels:fields.allowFrom.placeholder',
          },
          {
            key: 'groupPolicy',
            label: 'channels:fields.groupPolicy.label',
            type: 'select',
            options: [
              { value: 'allowlist', label: 'channels:fields.groupPolicy.allowlist' },
              { value: 'open', label: 'channels:fields.groupPolicy.open' },
              { value: 'disabled', label: 'channels:fields.groupPolicy.disabled' },
            ],
            defaultValue: 'allowlist',
          },
          {
            key: 'groupAllowFrom',
            label: 'channels:fields.groupAllowFrom.label',
            type: 'textarea',
            placeholder: 'channels:fields.groupAllowFrom.placeholder',
          },
        ],
      },
      {
        id: 'connection',
        label: 'channels:settings.connection',
        fields: [
          {
            key: 'webhookPort',
            label: 'channels:fields.webhookPort.label',
            type: 'number',
            placeholder: 'channels:fields.webhookPort.placeholder',
          },
          {
            key: 'webhookPath',
            label: 'channels:fields.webhookPath.label',
            type: 'text',
            placeholder: 'channels:fields.webhookPath.placeholder',
          },
        ],
      },
      {
        id: 'advanced',
        label: 'channels:settings.advanced',
        fields: [
          {
            key: 'mediaMaxMb',
            label: 'channels:fields.mediaMaxMb.label',
            type: 'number',
            placeholder: 'channels:fields.mediaMaxMb.placeholder',
          },
          {
            key: 'includeAttachments',
            label: 'channels:fields.includeAttachments.label',
            type: 'checkbox',
            defaultValue: true,
          },
          {
            key: 'proxy',
            label: 'channels:fields.proxy.label',
            type: 'text',
            placeholder: 'channels:fields.proxy.placeholder',
          },
          {
            key: 'streaming',
            label: 'channels:fields.streaming.label',
            type: 'checkbox',
            defaultValue: false,
          },
          {
            key: 'network',
            label: 'channels:fields.network.label',
            type: 'textarea',
            placeholder: 'channels:fields.network.placeholder',
          },
        ],
      },
    ],
  },
  wechat: {
    id: 'wechat',
    name: 'WeChat',
    icon: '💬',
    description: 'channels:meta.wechat.description',
    connectionType: 'qr',
    docsUrl: 'channels:meta.wechat.docsUrl',
    configFields: [],
    instructions: [
      'channels:meta.wechat.instructions.0',
      'channels:meta.wechat.instructions.1',
      'channels:meta.wechat.instructions.2',
      'channels:meta.wechat.instructions.3',
    ],
    isPlugin: true,
  },
  signal: {
    id: 'signal',
    name: 'Signal',
    icon: '🔒',
    description: 'channels:meta.signal.description',
    connectionType: 'token',
    docsUrl: 'channels:meta.signal.docsUrl',
    configFields: [
      {
        key: 'phoneNumber',
        label: 'channels:meta.signal.fields.phoneNumber.label',
        type: 'text',
        placeholder: 'channels:meta.signal.fields.phoneNumber.placeholder',
        required: true,
      },
    ],
    instructions: [
      'channels:meta.signal.instructions.0',
      'channels:meta.signal.instructions.1',
      'channels:meta.signal.instructions.2',
    ],
  },
  feishu: {
    id: 'feishu',
    name: 'Feishu / Lark',
    icon: '🐦',
    description: 'channels:meta.feishu.description',
    connectionType: 'token',
    docsUrl: 'channels:meta.feishu.docsUrl',
    configFields: [
      {
        key: 'appId',
        label: 'channels:meta.feishu.fields.appId.label',
        type: 'text',
        placeholder: 'channels:meta.feishu.fields.appId.placeholder',
        required: true,
        envVar: 'FEISHU_APP_ID',
      },
      {
        key: 'appSecret',
        label: 'channels:meta.feishu.fields.appSecret.label',
        type: 'password',
        placeholder: 'channels:meta.feishu.fields.appSecret.placeholder',
        required: true,
        envVar: 'FEISHU_APP_SECRET',
      },
    ],
    instructions: [
      'channels:meta.feishu.instructions.0',
      'channels:meta.feishu.instructions.1',
      'channels:meta.feishu.instructions.2',
      'channels:meta.feishu.instructions.3',
    ],
    isPlugin: true,
    settingsGroups: [
      {
        id: 'access',
        label: 'channels:settings.access',
        fields: [
          {
            key: 'dmPolicy',
            label: 'channels:fields.dmPolicy.label',
            type: 'select',
            options: [
              { value: 'pairing', label: 'channels:fields.dmPolicy.pairing' },
              { value: 'allowlist', label: 'channels:fields.dmPolicy.allowlist' },
              { value: 'open', label: 'channels:fields.dmPolicy.open' },
              { value: 'disabled', label: 'channels:fields.dmPolicy.disabled' },
            ],
            defaultValue: 'pairing',
          },
          {
            key: 'allowFrom',
            label: 'channels:fields.allowFrom.label',
            type: 'textarea',
            placeholder: 'channels:fields.allowFrom.placeholder',
            description: 'channels:fields.allowFrom.description',
          },
          {
            key: 'groupPolicy',
            label: 'channels:fields.groupPolicy.label',
            type: 'select',
            options: [
              { value: 'allowlist', label: 'channels:fields.groupPolicy.allowlist' },
              { value: 'open', label: 'channels:fields.groupPolicy.open' },
              { value: 'disabled', label: 'channels:fields.groupPolicy.disabled' },
            ],
            defaultValue: 'allowlist',
          },
          {
            key: 'groupAllowFrom',
            label: 'channels:fields.groupAllowFrom.label',
            type: 'textarea',
            placeholder: 'channels:fields.groupAllowFrom.placeholder',
          },
          {
            key: 'groupSenderAllowFrom',
            label: 'channels:fields.groupSenderAllowFrom.label',
            type: 'textarea',
            placeholder: 'channels:fields.groupSenderAllowFrom.placeholder',
            description: 'channels:fields.groupSenderAllowFrom.description',
          },
          {
            key: 'resolveSenderNames',
            label: 'channels:fields.resolveSenderNames.label',
            type: 'checkbox',
            defaultValue: true,
          },
          {
            key: 'requireMention',
            label: 'channels:fields.requireMention.label',
            type: 'checkbox',
            defaultValue: true,
          },
          {
            key: 'groups',
            label: 'channels:fields.groups.label',
            type: 'custom',
            description: 'channels:fields.groups.description',
          },
          {
            key: 'groupCommandMentionBypass',
            label: 'channels:fields.groupCommandMentionBypass.label',
            type: 'select',
            options: [
              { value: 'single_bot', label: 'channels:fields.groupCommandMentionBypass.single_bot' },
              { value: 'never', label: 'channels:fields.groupCommandMentionBypass.never' },
              { value: 'always', label: 'channels:fields.groupCommandMentionBypass.always' },
            ],
            defaultValue: 'single_bot',
          },
        ],
      },
      {
        id: 'connection',
        label: 'channels:settings.connection',
        fields: [
          {
            key: 'domain',
            label: 'channels:fields.domain.label',
            type: 'select',
            options: [
              { value: 'feishu', label: 'channels:fields.domain.feishu' },
              { value: 'lark', label: 'channels:fields.domain.lark' },
            ],
            defaultValue: 'feishu',
          },
          {
            key: 'connectionMode',
            label: 'channels:fields.connectionMode.label',
            type: 'select',
            options: [
              { value: 'websocket', label: 'channels:fields.connectionMode.websocket' },
              { value: 'webhook', label: 'channels:fields.connectionMode.webhook' },
            ],
            defaultValue: 'websocket',
          },
          {
            key: 'webhookPath',
            label: 'channels:fields.webhookPath.label',
            type: 'text',
            placeholder: 'channels:fields.webhookPath.placeholder',
          },
          {
            key: 'webhookPort',
            label: 'channels:fields.webhookPort.label',
            type: 'number',
            placeholder: 'channels:fields.webhookPort.placeholder',
          },
          {
            key: 'encryptKey',
            label: 'channels:fields.encryptKey.label',
            type: 'password',
            placeholder: 'channels:fields.encryptKey.placeholder',
          },
          {
            key: 'verificationToken',
            label: 'channels:fields.verificationToken.label',
            type: 'password',
            placeholder: 'channels:fields.verificationToken.placeholder',
          },
        ],
      },
      {
        id: 'advanced',
        label: 'channels:settings.advanced',
        fields: [
          {
            key: 'renderMode',
            label: 'channels:fields.renderMode.label',
            type: 'select',
            options: [
              { value: 'auto', label: 'channels:fields.renderMode.auto' },
              { value: 'raw', label: 'channels:fields.renderMode.raw' },
              { value: 'card', label: 'channels:fields.renderMode.card' },
            ],
            defaultValue: 'auto',
          },
          {
            key: 'streaming',
            label: 'channels:fields.streaming.label',
            type: 'checkbox',
            defaultValue: false,
          },
          {
            key: 'blockStreaming',
            label: 'channels:fields.blockStreaming.label',
            type: 'checkbox',
            defaultValue: false,
          },
          {
            key: 'typingIndicator',
            label: 'channels:fields.typingIndicator.label',
            type: 'checkbox',
            defaultValue: false,
          },
          {
            key: 'mediaMaxMb',
            label: 'channels:fields.mediaMaxMb.label',
            type: 'number',
            placeholder: 'channels:fields.mediaMaxMb.placeholder',
          },
          {
            key: 'proxy',
            label: 'channels:fields.proxy.label',
            type: 'text',
            placeholder: 'channels:fields.proxy.placeholder',
          },
          {
            key: 'network',
            label: 'channels:fields.network.label',
            type: 'textarea',
            placeholder: 'channels:fields.network.placeholder',
          },
          {
            key: 'dynamicAgentCreation',
            label: 'channels:fields.dynamicAgentCreation.label',
            type: 'textarea',
            placeholder: 'channels:fields.dynamicAgentCreation.placeholder',
          },
        ],
      },
    ],
  },
  imessage: {
    id: 'imessage',
    name: 'iMessage',
    icon: '💬',
    description: 'channels:meta.imessage.description',
    connectionType: 'token',
    docsUrl: 'channels:meta.imessage.docsUrl',
    configFields: [
      {
        key: 'serverUrl',
        label: 'channels:meta.imessage.fields.serverUrl.label',
        type: 'text',
        placeholder: 'channels:meta.imessage.fields.serverUrl.placeholder',
        required: true,
      },
      {
        key: 'password',
        label: 'channels:meta.imessage.fields.password.label',
        type: 'password',
        placeholder: 'channels:meta.imessage.fields.password.placeholder',
        required: true,
      },
    ],
    instructions: [
      'channels:meta.imessage.instructions.0',
      'channels:meta.imessage.instructions.1',
      'channels:meta.imessage.instructions.2',
    ],
    settingsGroups: [
      {
        id: 'access',
        label: 'channels:settings.access',
        fields: [
          {
            key: 'dmPolicy',
            label: 'channels:fields.dmPolicy.label',
            type: 'select',
            options: [
              { value: 'pairing', label: 'channels:fields.dmPolicy.pairing' },
              { value: 'allowlist', label: 'channels:fields.dmPolicy.allowlist' },
              { value: 'open', label: 'channels:fields.dmPolicy.open' },
              { value: 'disabled', label: 'channels:fields.dmPolicy.disabled' },
            ],
            defaultValue: 'pairing',
          },
          {
            key: 'allowFrom',
            label: 'channels:fields.allowFrom.label',
            type: 'textarea',
            placeholder: 'channels:fields.allowFrom.placeholder',
            description: 'channels:fields.allowFrom.description',
          },
          {
            key: 'groupPolicy',
            label: 'channels:fields.groupPolicy.label',
            type: 'select',
            options: [
              { value: 'allowlist', label: 'channels:fields.groupPolicy.allowlist' },
              { value: 'open', label: 'channels:fields.groupPolicy.open' },
              { value: 'disabled', label: 'channels:fields.groupPolicy.disabled' },
            ],
            defaultValue: 'allowlist',
          },
          {
            key: 'groupAllowFrom',
            label: 'channels:fields.groupAllowFrom.label',
            type: 'textarea',
            placeholder: 'channels:fields.groupAllowFrom.placeholder',
          },
        ],
      },
      {
        id: 'advanced',
        label: 'channels:settings.advanced',
        fields: [
          {
            key: 'mediaMaxMb',
            label: 'channels:fields.mediaMaxMb.label',
            type: 'number',
            placeholder: 'channels:fields.mediaMaxMb.placeholder',
          },
          {
            key: 'includeAttachments',
            label: 'channels:fields.includeAttachments.label',
            type: 'checkbox',
            defaultValue: true,
          },
        ],
      },
    ],
  },
  matrix: {
    id: 'matrix',
    name: 'Matrix',
    icon: '🔗',
    description: 'channels:meta.matrix.description',
    connectionType: 'token',
    docsUrl: 'channels:meta.matrix.docsUrl',
    configFields: [
      {
        key: 'homeserver',
        label: 'channels:meta.matrix.fields.homeserver.label',
        type: 'text',
        placeholder: 'channels:meta.matrix.fields.homeserver.placeholder',
        required: true,
      },
      {
        key: 'accessToken',
        label: 'channels:meta.matrix.fields.accessToken.label',
        type: 'password',
        placeholder: 'channels:meta.matrix.fields.accessToken.placeholder',
        required: true,
      },
    ],
    instructions: [
      'channels:meta.matrix.instructions.0',
      'channels:meta.matrix.instructions.1',
      'channels:meta.matrix.instructions.2',
    ],
    isPlugin: true,
  },
  line: {
    id: 'line',
    name: 'LINE',
    icon: '🟢',
    description: 'channels:meta.line.description',
    connectionType: 'token',
    docsUrl: 'channels:meta.line.docsUrl',
    configFields: [
      {
        key: 'channelAccessToken',
        label: 'channels:meta.line.fields.channelAccessToken.label',
        type: 'password',
        placeholder: 'channels:meta.line.fields.channelAccessToken.placeholder',
        required: true,
        envVar: 'LINE_CHANNEL_ACCESS_TOKEN',
      },
      {
        key: 'channelSecret',
        label: 'channels:meta.line.fields.channelSecret.label',
        type: 'password',
        placeholder: 'channels:meta.line.fields.channelSecret.placeholder',
        required: true,
        envVar: 'LINE_CHANNEL_SECRET',
      },
    ],
    instructions: [
      'channels:meta.line.instructions.0',
      'channels:meta.line.instructions.1',
      'channels:meta.line.instructions.2',
    ],
    isPlugin: true,
  },
  msteams: {
    id: 'msteams',
    name: 'Microsoft Teams',
    icon: '👔',
    description: 'channels:meta.msteams.description',
    connectionType: 'token',
    docsUrl: 'channels:meta.msteams.docsUrl',
    configFields: [
      {
        key: 'appId',
        label: 'channels:meta.msteams.fields.appId.label',
        type: 'text',
        placeholder: 'channels:meta.msteams.fields.appId.placeholder',
        required: true,
        envVar: 'MSTEAMS_APP_ID',
      },
      {
        key: 'appPassword',
        label: 'channels:meta.msteams.fields.appPassword.label',
        type: 'password',
        placeholder: 'channels:meta.msteams.fields.appPassword.placeholder',
        required: true,
        envVar: 'MSTEAMS_APP_PASSWORD',
      },
    ],
    instructions: [
      'channels:meta.msteams.instructions.0',
      'channels:meta.msteams.instructions.1',
      'channels:meta.msteams.instructions.2',
      'channels:meta.msteams.instructions.3',
    ],
    isPlugin: true,
  },
  googlechat: {
    id: 'googlechat',
    name: 'Google Chat',
    icon: '💭',
    description: 'channels:meta.googlechat.description',
    connectionType: 'webhook',
    docsUrl: 'channels:meta.googlechat.docsUrl',
    configFields: [
      {
        key: 'serviceAccountKey',
        label: 'channels:meta.googlechat.fields.serviceAccountKey.label',
        type: 'text',
        placeholder: 'channels:meta.googlechat.fields.serviceAccountKey.placeholder',
        required: true,
      },
    ],
    instructions: [
      'channels:meta.googlechat.instructions.0',
      'channels:meta.googlechat.instructions.1',
      'channels:meta.googlechat.instructions.2',
      'channels:meta.googlechat.instructions.3',
    ],
  },
  mattermost: {
    id: 'mattermost',
    name: 'Mattermost',
    icon: '💠',
    description: 'channels:meta.mattermost.description',
    connectionType: 'token',
    docsUrl: 'channels:meta.mattermost.docsUrl',
    configFields: [
      {
        key: 'serverUrl',
        label: 'channels:meta.mattermost.fields.serverUrl.label',
        type: 'text',
        placeholder: 'channels:meta.mattermost.fields.serverUrl.placeholder',
        required: true,
      },
      {
        key: 'botToken',
        label: 'channels:meta.mattermost.fields.botToken.label',
        type: 'password',
        placeholder: 'channels:meta.mattermost.fields.botToken.placeholder',
        required: true,
      },
    ],
    instructions: [
      'channels:meta.mattermost.instructions.0',
      'channels:meta.mattermost.instructions.1',
      'channels:meta.mattermost.instructions.2',
    ],
    isPlugin: true,
  },
  slack: {
    id: 'slack',
    name: 'Slack',
    icon: '#',
    description: 'channels:meta.slack.description',
    connectionType: 'token',
    docsUrl: 'channels:meta.slack.docsUrl',
    configFields: [
      {
        key: 'botToken',
        label: 'channels:meta.slack.fields.botToken.label',
        type: 'password',
        placeholder: 'channels:meta.slack.fields.botToken.placeholder',
        required: true,
        envVar: 'SLACK_BOT_TOKEN',
      },
      {
        key: 'signingSecret',
        label: 'channels:meta.slack.fields.signingSecret.label',
        type: 'password',
        placeholder: 'channels:meta.slack.fields.signingSecret.placeholder',
        required: true,
        envVar: 'SLACK_SIGNING_SECRET',
      },
      {
        key: 'appToken',
        label: 'channels:meta.slack.fields.appToken.label',
        type: 'password',
        placeholder: 'channels:meta.slack.fields.appToken.placeholder',
        envVar: 'SLACK_APP_TOKEN',
      },
    ],
    instructions: [
      'channels:meta.slack.instructions.0',
      'channels:meta.slack.instructions.1',
      'channels:meta.slack.instructions.2',
      'channels:meta.slack.instructions.3',
    ],
    settingsGroups: [
      {
        id: 'access',
        label: 'channels:settings.access',
        fields: [
          {
            key: 'dmPolicy',
            label: 'channels:fields.dmPolicy.label',
            type: 'select',
            options: [
              { value: 'pairing', label: 'channels:fields.dmPolicy.pairing' },
              { value: 'allowlist', label: 'channels:fields.dmPolicy.allowlist' },
              { value: 'open', label: 'channels:fields.dmPolicy.open' },
              { value: 'disabled', label: 'channels:fields.dmPolicy.disabled' },
            ],
            defaultValue: 'pairing',
          },
          {
            key: 'allowFrom',
            label: 'channels:fields.allowFrom.label',
            type: 'textarea',
            placeholder: 'channels:fields.allowFrom.placeholder',
            description: 'channels:fields.allowFrom.description',
          },
          {
            key: 'groupPolicy',
            label: 'channels:fields.groupPolicy.label',
            type: 'select',
            options: [
              { value: 'allowlist', label: 'channels:fields.groupPolicy.allowlist' },
              { value: 'open', label: 'channels:fields.groupPolicy.open' },
              { value: 'disabled', label: 'channels:fields.groupPolicy.disabled' },
            ],
            defaultValue: 'allowlist',
          },
          {
            key: 'groupAllowFrom',
            label: 'channels:fields.groupAllowFrom.label',
            type: 'textarea',
            placeholder: 'channels:fields.groupAllowFrom.placeholder',
          },
          {
            key: 'requireMention',
            label: 'channels:fields.requireMention.label',
            type: 'checkbox',
            defaultValue: true,
          },
        ],
      },
      {
        id: 'connection',
        label: 'channels:settings.connection',
        fields: [
          {
            key: 'webhookPort',
            label: 'channels:fields.webhookPort.label',
            type: 'number',
            placeholder: 'channels:fields.webhookPort.placeholder',
          },
          {
            key: 'webhookPath',
            label: 'channels:fields.webhookPath.label',
            type: 'text',
            placeholder: 'channels:fields.webhookPath.placeholder',
          },
        ],
      },
      {
        id: 'advanced',
        label: 'channels:settings.advanced',
        fields: [
          {
            key: 'textChunkLimit',
            label: 'channels:fields.textChunkLimit.label',
            type: 'number',
            placeholder: 'channels:fields.textChunkLimit.placeholder',
          },
          {
            key: 'chunkMode',
            label: 'channels:fields.chunkMode.label',
            type: 'text',
            placeholder: 'channels:fields.textChunkLimit.placeholder',
          },
          {
            key: 'proxy',
            label: 'channels:fields.proxy.label',
            type: 'text',
            placeholder: 'channels:fields.proxy.placeholder',
          },
          {
            key: 'streaming',
            label: 'channels:fields.streaming.label',
            type: 'checkbox',
            defaultValue: false,
          },
          {
            key: 'network',
            label: 'channels:fields.network.label',
            type: 'textarea',
            placeholder: 'channels:fields.network.placeholder',
          },
        ],
      },
    ],
  },
};

// ═══ Binding Types ═══

/** 路由模式：决定消息如何匹配到绑定规则 */
export type RoutingMode = 'peer' | 'accountId' | 'both';

/** 绑定类型：标准路由 vs 远程 Agent 协议 */
export type BindingType = 'route' | 'acp';

/** Peer 类型：私聊 vs 群聊（仅 peer/both 模式） */
export type PeerKind = 'dm' | 'group';

/** ACP 远程 Agent 配置（仅 acp 绑定类型） */
export interface AcpConfig {
  endpoint: string;
  protocol?: string;
  capabilities?: string[];
}

/** Discord 绑定扩展字段 */
export interface DiscordBindingFields {
  guildId?: string;
  teamId?: string;
  roles?: string[];
}

/** 绑定信息（后端返回给前端） */
export interface BindingInfo {
  index: number;
  agentId: string;
  channel: string;
  routingMode: RoutingMode;
  accountId?: string;
  peerKind?: PeerKind;
  peerId?: string;
  comment?: string;
  bindingType: BindingType;
  acp?: AcpConfig;
  discord?: DiscordBindingFields;
}

/** 绑定请求（前端提交给后端） */
export interface BindingRequest {
  agentId: string;
  channel: string;
  routingMode?: RoutingMode;
  accountId?: string;
  peerKind?: PeerKind;
  peerId?: string;
  comment?: string;
  bindingType?: BindingType;
  acp?: AcpConfig;
  discord?: DiscordBindingFields;
}

/** 路由模式选项（UI 展示用） */
export const ROUTING_MODE_OPTIONS: { value: RoutingMode; label: string; description: string }[] = [
  { value: 'peer', label: 'Peer', description: '通过聊天对象路由' },
  { value: 'accountId', label: 'Account ID', description: '通过账号 ID 路由' },
  { value: 'both', label: 'Both', description: '同时支持两种方式' },
];

/** 绑定类型选项（UI 展示用） */
export const BINDING_TYPE_OPTIONS: { value: BindingType; label: string; description: string }[] = [
  { value: 'route', label: '路由绑定', description: '标准消息路由（默认）' },
  { value: 'acp', label: 'ACP 远程', description: '远程 Agent 协议绑定' },
];

/** Peer 类型选项（UI 展示用） */
export const PEER_KIND_OPTIONS: { value: PeerKind; label: string }[] = [
  { value: 'dm', label: '私聊 (DM)' },
  { value: 'group', label: '群聊 (Group)' },
];

/**
 * Get primary supported channels (non-plugin, commonly used)
 */
export function getPrimaryChannels(): ChannelType[] {
  return ['telegram', 'discord', 'whatsapp', 'wechat', 'dingtalk', 'feishu', 'wecom', 'qqbot', 'slack'];
}

/**
 * Get all available channels including plugins
 */
export function getAllChannels(): ChannelType[] {
  return Object.keys(CHANNEL_META) as ChannelType[];
}
