import { describe, it, expect } from 'vitest';
import { desensitize, restore, markSensitive } from '../../electron/api/services/desensitize';
import { markSensitive as markSensitiveFrontend } from '../../src/lib/desensitize';

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

  describe('markSensitive (backend)', () => {
    it('should replace first occurrence of selection', () => {
      const result = markSensitive('姓名：张三，电话：138', {}, '张三', 'NAME');
      expect(result.text).toBe('姓名：__PII_NAME_00000001__，电话：138');
      expect(result.map).toEqual({ '__PII_NAME_00000001__': '张三' });
    });

    it('should increment counter when called on existing map', () => {
      const existingMap = { '__PII_NAME_00000001__': '张三' };
      const result = markSensitive('李四', existingMap, '李四', 'NAME');
      expect(result.text).toBe('__PII_NAME_00000002__');
      expect(result.map).toEqual({
        '__PII_NAME_00000001__': '张三',
        '__PII_NAME_00000002__': '李四',
      });
    });

    it('should skip marking when selection contains placeholders', () => {
      const existingMap = { '__PII_NAME_00000001__': '张三' };
      const result = markSensitive(
        '__PII_NAME_00000001__',
        existingMap,
        '__PII_NAME_00000001__',
        'NAME',
      );
      expect(result).toEqual({ text: '__PII_NAME_00000001__', map: existingMap });
    });

    it('should skip empty or whitespace-only selection', () => {
      const result = markSensitive('hello world', {}, '', 'NAME');
      expect(result).toEqual({ text: 'hello world', map: {} });
    });

    it('should skip when selection is not found in text', () => {
      const result = markSensitive('hello world', {}, 'xyz', 'NAME');
      expect(result).toEqual({ text: 'hello world', map: {} });
    });

    it('should trim selection before matching', () => {
      const result = markSensitive('姓名：张三', {}, '  张三  ', 'NAME');
      expect(result.text).toBe('姓名：__PII_NAME_00000001__');
    });

    it('should use different counters for different types', () => {
      const map1 = markSensitive('13800138000', {}, '13800138000', 'PHONE').map;
      const map2 = markSensitive('王五', { ...map1 }, '王五', 'NAME').map;
      const keys = Object.keys(map2);
      // PHONE counter should be 1, NAME counter should be 2
      expect(keys[0]).toBe('__PII_PHONE_00000001__');
      expect(keys[1]).toBe('__PII_NAME_00000002__');
    });
  });

  describe('markSensitive (frontend)', () => {
    it('should produce identical results to backend for basic cases', () => {
      const text = '联系人：张三';
      const backendResult = markSensitive(text, {}, '张三', 'NAME');
      const frontendResult = markSensitiveFrontend(text, {}, '张三', 'NAME');
      expect(backendResult.text).toBe(frontendResult.text);
      expect(backendResult.map).toEqual(frontendResult.map);
    });

    it('should both reject placeholder selections', () => {
      const placeholder = '__PII_NAME_00000001__';
      const existingMap = { [placeholder]: '张三' };
      const backendResult = markSensitive(placeholder, existingMap, placeholder, 'NAME');
      const frontendResult = markSensitiveFrontend(placeholder, existingMap, placeholder, 'NAME');
      expect(backendResult).toEqual({ text: placeholder, map: existingMap });
      expect(frontendResult).toEqual({ text: placeholder, map: existingMap });
    });

    it('should both skip empty selections', () => {
      const backendResult = markSensitive('hello', {}, '', 'NAME');
      const frontendResult = markSensitiveFrontend('hello', {}, '', 'NAME');
      expect(backendResult).toEqual({ text: 'hello', map: {} });
      expect(frontendResult).toEqual({ text: 'hello', map: {} });
    });
  });
});
