'use client';

interface TokenIconProps {
  icon: string;
  name?: string;
  className?: string;
  size?: number;
}

/**
 * 토큰 아이콘을 렌더링하는 컴포넌트
 * icon이 이미지 경로('/'로 시작)이면 img 태그로, 그 외에는 텍스트로 렌더링
 */
export function TokenIcon({ icon, name, className = '', size = 24 }: TokenIconProps) {
  // 이미지 경로인지 확인 (공개 경로는 '/'로 시작)
  const isImagePath = icon.startsWith('/');

  if (isImagePath) {
    return (
      <img
        src={icon}
        alt={name || 'Token icon'}
        className={className || `h-${size} w-${size} object-contain`}
        style={{ width: size, height: size }}
      />
    );
  }

  // 이모지나 텍스트인 경우
  return <span className={className || 'text-lg'}>{icon}</span>;
}

