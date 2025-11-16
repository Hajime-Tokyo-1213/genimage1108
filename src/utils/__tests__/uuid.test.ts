import { describe, it, expect } from 'vitest';
import { generateUUID } from '../uuid';

describe('uuid utilities', () => {
  describe('generateUUID', () => {
    it('should generate a valid UUID', () => {
      const uuid = generateUUID();
      
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      
      expect(uuid).toMatch(uuidRegex);
    });

    it('should generate unique UUIDs', () => {
      const uuid1 = generateUUID();
      const uuid2 = generateUUID();
      
      expect(uuid1).not.toBe(uuid2);
    });

    it('should generate UUIDs of correct length', () => {
      const uuid = generateUUID();
      
      // UUID format is 36 characters including hyphens
      expect(uuid).toHaveLength(36);
    });

    it('should generate multiple unique UUIDs', () => {
      const uuids = new Set();
      
      // Generate 100 UUIDs and check they're all unique
      for (let i = 0; i < 100; i++) {
        uuids.add(generateUUID());
      }
      
      expect(uuids.size).toBe(100);
    });

    it('should always have version 4 indicator', () => {
      const uuid = generateUUID();
      
      // 13th character should be '4' for version 4 UUID
      expect(uuid[14]).toBe('4');
    });

    it('should have correct variant bits', () => {
      const uuid = generateUUID();
      
      // 17th character should be 8, 9, A, or B
      const variantChar = uuid[19].toLowerCase();
      expect(['8', '9', 'a', 'b']).toContain(variantChar);
    });
  });
});