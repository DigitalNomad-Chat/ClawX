/**
 * Shared types for ClawX License Server
 */

export type Tier = 'free' | 'pro' | 'enterprise'
export type LicenseStatus = 'active' | 'revoked' | 'expired'
export type UserStatus = 'active' | 'suspended' | 'deleted'

export interface Env {
  DB: D1Database
  ADMIN_API_KEY: string
  JWT_SECRET: string
}

// Database row types
export interface DbLicense {
  id: string
  license_key: string
  tier: Tier
  status: LicenseStatus
  max_devices: number
  duration_days: number
  activated_count: number
  created_at: number
  updated_at: number
  notes: string | null
}

export interface DbActivation {
  id: string
  license_key: string
  device_fingerprint: string
  user_id: string | null
  tier: Tier
  activated_at: number
  expires_at: number | null
  last_verified_at: number | null
  revoked: number
}

export interface DbUser {
  id: string
  username: string
  email: string
  password_hash: string
  password_salt: string
  avatar_url: string | null
  tier: Tier
  balance: number
  status: UserStatus
  created_at: number
  updated_at: number
}

export interface DbSession {
  id: string
  user_id: string
  device_id: string | null
  token_hash: string
  created_at: number
  expires_at: number
}

export interface DbUsage {
  id: number
  user_id: string
  feature: string
  year_month: string
  used_count: number
}

export interface DbTierConfig {
  tier: Tier
  display_name: string
  monthly_quota: number
  features: string
  max_devices: number
  updated_at: number
}

// Auth context
export interface AuthContext {
  userId: string
  username: string
  tier: Tier
}

// API request types
export interface ActivateRequest {
  licenseKey: string
  deviceId: string
  userId?: string
  clientType: string
}

export interface VerifyRequest {
  licenseKey: string
  deviceId: string
  clientType: string
}

export interface CreateLicenseRequest {
  tier: Tier
  durationDays?: number
  maxDevices?: number
  notes?: string
}

export interface RegisterRequest {
  username: string
  email: string
  password: string
  deviceId?: string
}

export interface LoginRequest {
  usernameOrEmail: string
  password: string
  deviceId?: string
}

export interface RecordUsageRequest {
  feature: string
}

export interface UpdateTierRequest {
  displayName?: string
  monthlyQuota?: number
  features?: string[]
  maxDevices?: number
}

export interface UpdateUserRequest {
  username?: string
  email?: string
  tier?: Tier
  status?: UserStatus
  balance?: number
  avatarUrl?: string
}
