import { describe, expect, it } from "vitest";
import { decompose } from "./decompose";

describe("decompose", () => {
  it("분해: 가 -> ㄱ ㅏ (종성 없음)", () => {
    expect(decompose("가")).toEqual({ cho: "ㄱ", jung: "ㅏ", jong: null });
  });

  it("분해: 한 -> ㅎ ㅏ ㄴ", () => {
    expect(decompose("한")).toEqual({ cho: "ㅎ", jung: "ㅏ", jong: "ㄴ" });
  });

  it("분해: 뷁 -> ㅂ ㅞ ㄺ (겹받침)", () => {
    expect(decompose("뷁")).toEqual({ cho: "ㅂ", jung: "ㅞ", jong: "ㄺ" });
  });

  it("분해: 읽 -> ㅇ ㅣ ㄺ (겹받침)", () => {
    expect(decompose("읽")).toEqual({ cho: "ㅇ", jung: "ㅣ", jong: "ㄺ" });
  });

  it("분해: 힣 -> ㅎ ㅣ ㅎ (마지막 완성형 음절)", () => {
    expect(decompose("힣")).toEqual({ cho: "ㅎ", jung: "ㅣ", jong: "ㅎ" });
  });

  it("완성형 음절이 아니면 null: 영문자", () => {
    expect(decompose("A")).toBeNull();
  });

  it("완성형 음절이 아니면 null: 호환 자모 단독", () => {
    expect(decompose("ㄱ")).toBeNull();
  });

  it("완성형 음절이 아니면 null: 빈 문자열", () => {
    expect(decompose("")).toBeNull();
  });

  it("완성형 음절이 아니면 null: 여러 글자 문자열", () => {
    expect(decompose("가나")).toBeNull();
  });

  it("경계값: 가 (U+AC00, 첫 완성형 음절)", () => {
    expect(decompose("가")).toEqual({ cho: "ㄱ", jung: "ㅏ", jong: null });
  });
});
