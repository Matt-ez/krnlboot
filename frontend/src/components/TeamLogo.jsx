import { useState } from 'react';

export default function TeamLogo({ logoUrl, sigla, color, alt, size = 32, rounded = 8 }) {
  const [hasError, setHasError] = useState(false);

  if (logoUrl && !hasError) {
    return (
      <img
        src={logoUrl}
        alt={alt}
        className="team-crest"
        style={{ width: size, height: size, borderRadius: rounded }}
        loading="lazy"
        onError={() => setHasError(true)}
      />
    );
  }

  return (
    <span
      className="team-badge"
      style={{
        width: size,
        height: size,
        borderRadius: rounded,
        background: `${color}33`,
        color,
        fontSize: size <= 28 ? '.6rem' : size <= 40 ? '.65rem' : '1rem',
      }}
      aria-label={alt}
      title={alt}
    >
      {sigla}
    </span>
  );
}
