import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 숫자 문자열에 천단위 콤마 추가
 * @param value - 숫자 문자열 (예: "1234567")
 * @returns 콤마가 추가된 문자열 (예: "1,234,567")
 */
export function formatNumberWithCommas(value: string): string {
  // 콤마 제거 후 숫자만 추출
  const numericValue = value.replace(/,/g, '');
  // 빈 문자열이면 그대로 반환
  if (numericValue === '' || numericValue === '-') return numericValue;
  // 숫자가 아니면 빈 문자열 반환
  if (isNaN(Number(numericValue))) return '';
  // 천단위 콤마 추가
  return Number(numericValue).toLocaleString('ko-KR');
}

/**
 * 콤마가 포함된 숫자 문자열에서 콤마 제거
 * @param value - 콤마가 포함된 숫자 문자열 (예: "1,234,567")
 * @returns 콤마가 제거된 문자열 (예: "1234567")
 */
export function removeCommas(value: string): string {
  return value.replace(/,/g, '');
}

/**
 * 입력 필드용 핸들러: 콤마를 제거한 값을 반환
 * @param value - 사용자 입력 값
 * @returns 콤마가 제거된 숫자 문자열
 */
export function handleNumberInput(value: string): string {
  // 콤마 제거
  const numericValue = removeCommas(value);
  // 숫자만 허용 (소수점 포함)
  const match = numericValue.match(/^-?\d*\.?\d*$/);
  return match ? match[0] : '';
}
