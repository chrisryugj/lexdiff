/**
 * Confidence - 신뢰도 값 객체
 *
 * 0.0 ~ 1.0 범위의 신뢰도 값을 안전하게 다루는 값 객체
 * 조화평균을 통한 신뢰도 결합 지원
 */

export class Confidence {
  private readonly value: number

  private constructor(value: number) {
    if (value < 0 || value > 1) {
      throw new Error(`Invalid confidence value: ${value}. Must be between 0 and 1.`)
    }
    this.value = value
  }

  /**
   * Confidence 생성
   */
  static create(value: number): Confidence {
    return new Confidence(Math.max(0, Math.min(1, value)))
  }

  /**
   * 값 반환
   */
  getValue(): number {
    return this.value
  }

  /**
   * 확실한 경우 (자동 실행 가능)
   * confidence >= 0.95
   */
  isCertain(): boolean {
    return this.value >= 0.95
  }

  /**
   * 높은 신뢰도 (자동 실행 권장)
   * confidence >= 0.7
   */
  isHigh(): boolean {
    return this.value >= 0.7
  }

  /**
   * 애매한 경우 (다이얼로그 필요)
   * confidence < 0.7
   */
  isAmbiguous(): boolean {
    return this.value < 0.7
  }

  /**
   * 매우 애매한 경우
   * confidence < 0.6
   */
  isVeryAmbiguous(): boolean {
    return this.value < 0.6
  }

  /**
   * 두 Confidence의 조화평균 계산
   * 조화평균은 두 값 중 낮은 값에 더 가중치를 둠
   */
  static harmonicMean(a: Confidence, b: Confidence): Confidence {
    const av = a.getValue()
    const bv = b.getValue()

    if (av === 0 || bv === 0) {
      return Confidence.create(0)
    }

    const harmonic = 2 / (1 / av + 1 / bv)
    return Confidence.create(harmonic)
  }

  /**
   * 두 Confidence의 산술평균 계산
   */
  static arithmeticMean(a: Confidence, b: Confidence): Confidence {
    const mean = (a.getValue() + b.getValue()) / 2
    return Confidence.create(mean)
  }

  /**
   * 최대값 반환
   */
  static max(a: Confidence, b: Confidence): Confidence {
    return a.getValue() >= b.getValue() ? a : b
  }

  /**
   * 최소값 반환
   */
  static min(a: Confidence, b: Confidence): Confidence {
    return a.getValue() <= b.getValue() ? a : b
  }

  /**
   * 문자열 표현
   */
  toString(): string {
    return `Confidence(${this.value.toFixed(2)})`
  }

  /**
   * JSON 직렬화용
   */
  toJSON(): number {
    return this.value
  }
}

/**
 * 조화평균 계산 유틸리티 함수 (레거시 호환)
 */
export function calculateHarmonicMean(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return 2 / (1 / a + 1 / b)
}
