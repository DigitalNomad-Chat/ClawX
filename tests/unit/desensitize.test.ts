import { describe, it, expect } from 'vitest';
import { desensitize, restore } from '../../electron/api/services/desensitize';

describe('desensitize service', () => {
  describe('desensitize', () => {
    it('should replace phone numbers', () => {
      const result = desensitize('联系电话：13800138000');
      expect(result.text).toContain('__PII_PHONE_');
      const placeholder = Object.keys(result.map)[0];
      expect(result.map[placeholder]).toBe('13800138000');
    });

    it('should replace email addresses', () => {
      const result = desensitize('邮箱：test@example.com');
      expect(result.text).toContain('__PII_EMAIL_');
      const placeholder = Object.keys(result.map)[0];
      expect(result.map[placeholder]).toBe('test@example.com');
    });

    it('should replace ID cards with valid checksum', () => {
      const result = desensitize('身份证号：110101199003078873');
      expect(result.text).toContain('__PII_ID_CARD_');
    });

    it('should not replace invalid ID cards', () => {
      const result = desensitize('身份证号：110101199003078876');
      expect(result.text).not.toContain('__PII_ID_CARD_');
    });

    it('should replace names after keywords', () => {
      const result = desensitize('投保人：张三');
      expect(result.text).toContain('__PII_NAME_');
      expect(result.map[Object.keys(result.map)[0]]).toBe('张三');
    });

    it('should not replace insurance terms as names', () => {
      const result = desensitize('保险期间：投保人');
      expect(result.text).not.toContain('__PII_NAME_保险期间');
    });
  });

  describe('restore', () => {
    it('should restore placeholders back to original values', () => {
      const map = {
        '__PII_PHONE_00000001__': '13800138000',
        '__PII_NAME_00000002__': '张三',
      };
      const restored = restore('联系人__PII_NAME_00000002__，电话__PII_PHONE_00000001__', map);
      expect(restored).toBe('联系人张三，电话13800138000');
    });
  });
});
