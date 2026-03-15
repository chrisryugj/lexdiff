/**
 * 광역시도 코드 매핑
 * 법제처 API org 파라미터용
 */

export interface Municipality {
  code: string
  name: string
  shortName: string
}

export const METRO_MUNICIPALITIES: Municipality[] = [
  { code: '1100000', name: '서울특별시', shortName: '서울' },
  { code: '2600000', name: '부산광역시', shortName: '부산' },
  { code: '2700000', name: '대구광역시', shortName: '대구' },
  { code: '2800000', name: '인천광역시', shortName: '인천' },
  { code: '2900000', name: '광주광역시', shortName: '광주' },
  { code: '3000000', name: '대전광역시', shortName: '대전' },
  { code: '3100000', name: '울산광역시', shortName: '울산' },
  { code: '3600000', name: '세종특별자치시', shortName: '세종' },
  { code: '4100000', name: '경기도', shortName: '경기' },
  { code: '5100000', name: '강원특별자치도', shortName: '강원' },
  { code: '4300000', name: '충청북도', shortName: '충북' },
  { code: '4400000', name: '충청남도', shortName: '충남' },
  { code: '4500000', name: '전북특별자치도', shortName: '전북' },
  { code: '4600000', name: '전라남도', shortName: '전남' },
  { code: '4700000', name: '경상북도', shortName: '경북' },
  { code: '4800000', name: '경상남도', shortName: '경남' },
  { code: '5000000', name: '제주특별자치도', shortName: '제주' },
]

export function getMunicipalityByCode(code: string): Municipality | undefined {
  return METRO_MUNICIPALITIES.find(m => m.code === code)
}
