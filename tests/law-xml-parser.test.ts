import { describe, expect, it } from "vitest"

import { parseLawXML } from "../lib/law-xml-parser"

const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<법령>
  <기본정보>
    <법령ID>000000</법령ID>
    <법령명_한글>샘플법</법령명_한글>
    <시행일자>20240101</시행일자>
  </기본정보>
  <조문>
    <조문번호>제1조</조문번호>
    <조문내용>제1조(목적) 이 법은 목적을 규정한다.</조문내용>
  </조문>
  <조문>
    <조문내용>이 조문은 두 번째 본문이며 제목 정보가 없습니다.</조문내용>
  </조문>
</법령>`

describe("parseLawXML", () => {
  it("should generate stable jo codes even when the source lacks numbers", () => {
    const { articles } = parseLawXML(sampleXml)

    expect(articles).toHaveLength(2)
    expect(articles[0].jo).toBe("000100")
    expect(articles[0].joNum).toBe("제1조")

    expect(articles[1].jo).toMatch(/^0002\d{2}$/)
    expect(articles[1].joNum).toBe("제2조")
  })

  it("should normalize inconsistent jo labels and keep numbering sequential", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<법령>
  <기본정보>
    <법령ID>111111</법령ID>
    <법령명_한글>불규칙라벨법</법령명_한글>
    <시행일자>20240101</시행일자>
  </기본정보>
  <조문>
    <조문번호>1조</조문번호>
    <조문내용>제1조(목적) 목적을 규정한다.</조문내용>
  </조문>
  <조문>
    <조문내용>제2조(정의) 용어를 정의한다.</조문내용>
  </조문>
  <조문>
    <조문번호>제2조</조문번호>
    <조문내용>제2조의2(특례) 특례를 규정한다.</조문내용>
  </조문>
</법령>`

    const { articles } = parseLawXML(xml)

    expect(articles).toHaveLength(3)
    expect(articles[0].joNum).toBe("제1조")
    expect(articles[0].jo).toBe("000100")

    expect(articles[1].joNum).toBe("제2조")
    expect(articles[1].jo).toBe("000200")

    expect(articles[2].joNum).toBe("제2조의2")
    expect(articles[2].jo).toBe("000202")
  })
})
