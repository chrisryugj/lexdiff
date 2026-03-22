import { describe, it, expect } from 'vitest'
import {
  RELATION_TYPES, RELATION_LABELS,
  LAW_NODE_TYPES, NODE_TYPE_LABELS,
  isValidRelationType, isValidNodeType,
} from '@/lib/relation-graph/relation-types'

describe('RelationType', () => {
  it('6개 관계 타입이 정의되어 있다', () => {
    expect(RELATION_TYPES).toHaveLength(6)
    expect(RELATION_TYPES).toContain('delegates')
    expect(RELATION_TYPES).toContain('implements')
    expect(RELATION_TYPES).toContain('cites')
    expect(RELATION_TYPES).toContain('interprets')
    expect(RELATION_TYPES).toContain('basis')
    expect(RELATION_TYPES).toContain('amends')
  })

  it('모든 관계 타입에 한글 라벨이 있다', () => {
    for (const type of RELATION_TYPES) {
      expect(RELATION_LABELS[type]).toBeDefined()
      expect(RELATION_LABELS[type].length).toBeGreaterThan(0)
    }
  })

  it('유효한 관계 타입을 검증한다', () => {
    expect(isValidRelationType('delegates')).toBe(true)
    expect(isValidRelationType('cites')).toBe(true)
    expect(isValidRelationType('interprets')).toBe(true)
  })

  it('잘못된 관계 타입을 거부한다', () => {
    expect(isValidRelationType('invalid')).toBe(false)
    expect(isValidRelationType('')).toBe(false)
    expect(isValidRelationType('DELEGATES')).toBe(false)
  })
})

describe('LawNodeType', () => {
  it('6개 노드 타입이 정의되어 있다', () => {
    expect(LAW_NODE_TYPES).toHaveLength(6)
    expect(LAW_NODE_TYPES).toContain('law')
    expect(LAW_NODE_TYPES).toContain('decree')
    expect(LAW_NODE_TYPES).toContain('rule')
    expect(LAW_NODE_TYPES).toContain('ordinance')
    expect(LAW_NODE_TYPES).toContain('admin_rule')
    expect(LAW_NODE_TYPES).toContain('precedent')
  })

  it('모든 노드 타입에 한글 라벨이 있다', () => {
    for (const type of LAW_NODE_TYPES) {
      expect(NODE_TYPE_LABELS[type]).toBeDefined()
    }
  })

  it('유효한 노드 타입을 검증한다', () => {
    expect(isValidNodeType('law')).toBe(true)
    expect(isValidNodeType('precedent')).toBe(true)
  })

  it('잘못된 노드 타입을 거부한다', () => {
    expect(isValidNodeType('unknown')).toBe(false)
    expect(isValidNodeType('LAW')).toBe(false)
  })
})
